import { create } from 'zustand'
import { desktop } from '@/platform/desktop'
import type { ProjectDocument } from '@shared/editor-contracts'

export type EditorMode = 'file' | 'git' | 'draft' | 'conflict'
export type BufferDocument = {
  projectId: string
  path: string
  base: ProjectDocument
  text: string
  disk: ProjectDocument | null
  saving: boolean
  error: string | null
}
export const documentKey = (projectId: string, path: string) => `${projectId}:${path}`
export const modelUri = (projectId: string, path: string) =>
  `devly://${projectId}/${path.split('/').map(encodeURIComponent).join('/')}`
export const isDirty = (document: BufferDocument) =>
  document.base.status === 'text' && document.text !== document.base.text
type EditorState = {
  documents: Record<string, BufferDocument>
  visible: Record<string, boolean>
  section: Record<string, 'files' | 'changes'>
  active: Record<string, { path: string; mode: EditorMode }>
  error: string | null
  disposeModel: ((uri: string) => void) | null
  show(projectId: string, section?: 'files' | 'changes'): void
  hide(projectId: string): void
  open(projectId: string, path: string, mode?: EditorMode): Promise<void>
  edit(projectId: string, path: string, text: string): void
  refresh(projectId: string): Promise<void>
  save(projectId: string, path: string): Promise<boolean>
  reload(projectId: string, path: string): Promise<void>
  close(projectId: string, path: string): void
}
export const useEditorStore = create<EditorState>((set, get) => ({
  documents: {},
  visible: {},
  section: {},
  active: {},
  error: null,
  disposeModel: null,
  show: (projectId, section = 'files') =>
    set((state) => ({
      visible: { ...state.visible, [projectId]: true },
      section: { ...state.section, [projectId]: section },
    })),
  hide: (projectId) => set((state) => ({ visible: { ...state.visible, [projectId]: false } })),
  open: async (projectId, path, mode = 'file') => {
    const key = documentKey(projectId, path)
    if (!get().documents[key]) {
      if (Object.keys(get().documents).length >= 20)
        throw new Error('最多打开 20 个文件，请先保存并关闭部分标签')
      const base = await desktop.data('editor.read', { projectId, path })
      set((state) => ({
        documents: state.documents[key]
          ? state.documents
          : {
              ...state.documents,
              [key]: {
                projectId,
                path,
                base,
                text: base.text ?? '',
                disk: null,
                saving: false,
                error: null,
              },
            },
      }))
    }
    set((state) => ({
      visible: { ...state.visible, [projectId]: true },
      active: { ...state.active, [projectId]: { path, mode } },
      error: null,
    }))
  },
  edit: (projectId, path, text) =>
    set((state) => {
      const key = documentKey(projectId, path),
        document = state.documents[key]
      if (!document || document.text === text) return {}
      return { documents: { ...state.documents, [key]: { ...document, text, error: null } } }
    }),
  refresh: async (projectId) => {
    const documents = Object.values(get().documents).filter(
      (document) => document.projectId === projectId,
    )
    await Promise.all(
      documents.map(async (snapshot) => {
        const next = await desktop.data('editor.read', { projectId, path: snapshot.path })
        const key = documentKey(projectId, snapshot.path)
        set((state) => {
          const current = state.documents[key]
          if (!current || current.saving || current.base.version !== snapshot.base.version)
            return {}
          if (next.version === current.base.version && next.status === current.base.status)
            return current.disk
              ? { documents: { ...state.documents, [key]: { ...current, disk: null } } }
              : {}
          return {
            documents: {
              ...state.documents,
              [key]: isDirty(current)
                ? { ...current, disk: next }
                : {
                    ...current,
                    base: next,
                    text: next.text ?? current.text,
                    disk: null,
                    error: null,
                  },
            },
          }
        })
      }),
    )
  },
  save: async (projectId, path) => {
    const key = documentKey(projectId, path),
      snapshot = get().documents[key]
    if (!snapshot || snapshot.saving || !snapshot.base.version || snapshot.base.status !== 'text')
      return false
    if (!isDirty(snapshot)) return true
    set((state) => ({
      documents: { ...state.documents, [key]: { ...snapshot, saving: true, error: null } },
    }))
    try {
      const result = await desktop.data('editor.save', {
        projectId,
        path,
        expectedHash: snapshot.base.version,
        content: snapshot.text,
      })
      set((state) => {
        const current = state.documents[key]
        if (!current) return {}
        return {
          documents: {
            ...state.documents,
            [key]: result.saved
              ? { ...current, base: result.document, disk: null, saving: false, error: null }
              : {
                  ...current,
                  disk: result.document,
                  saving: false,
                  error:
                    result.error === 'conflict'
                      ? '磁盘文件已改变，已阻止覆盖。请比较外部更改。'
                      : result.error === 'missing'
                        ? '磁盘文件已删除，未重新创建；本地编辑仍保留。'
                        : '保存未完成，请核对文件与权限后再试。',
                },
          },
        }
      })
      return result.saved
    } catch (error) {
      set((state) => ({
        documents: {
          ...state.documents,
          [key]: {
            ...state.documents[key],
            saving: false,
            error: error instanceof Error ? error.message : '保存失败',
          },
        },
      }))
      return false
    }
  },
  reload: async (projectId, path) => {
    const base = await desktop.data('editor.read', { projectId, path }),
      key = documentKey(projectId, path)
    set((state) => ({
      documents: {
        ...state.documents,
        [key]: {
          ...state.documents[key],
          base,
          text: base.text ?? '',
          disk: null,
          error: null,
          saving: false,
        },
      },
      active: { ...state.active, [projectId]: { path, mode: 'file' } },
    }))
  },
  close: (projectId, path) => {
    const key = documentKey(projectId, path)
    const document = get().documents[key]
    if (document?.saving) return
    set((state) => {
      const documents = { ...state.documents }
      delete documents[key]
      const next = Object.values(documents).find((document) => document.projectId === projectId)
      const active = { ...state.active }
      if (active[projectId]?.path === path) {
        if (next) active[projectId] = { path: next.path, mode: 'file' }
        else delete active[projectId]
      }
      return { documents, active }
    })
    setTimeout(() => get().disposeModel?.(modelUri(projectId, path)), 0)
  },
}))
