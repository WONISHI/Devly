import { create } from 'zustand'
import { desktop } from '@/platform/desktop'
import {
  defaultSettings,
  type RecentProject,
  type Session,
  type Settings,
  type Provider,
} from '@shared/data-contracts'
import { modelOptions } from '@/features/workspace/model-options'
export type WorkspaceTab = 'workspace' | 'components' | 'providers'
type Cursor = { time: number; id: string } | null
type WorkspaceState = {
  project: RecentProject | null
  projects: RecentProject[]
  sessions: Session[]
  activeSession: Session | null
  settings: Settings
  projectSettings: Settings
  providers: Provider[]
  credentialAvailable: boolean
  tab: WorkspaceTab
  loading: boolean
  loadError: string | null
  archived: boolean
  nextCursor: Cursor
  setTab: (tab: WorkspaceTab) => void
  refresh: () => Promise<void>
  selectProject: (id: string) => Promise<void>
  selectModel: (providerId: string, model: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  newSession: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  archiveSession: (id: string, archived: boolean) => Promise<void>
  showArchived: (archived: boolean) => Promise<void>
  loadMore: () => Promise<void>
}
let revision = 0
export const useWorkspace = create<WorkspaceState>((set, get) => ({
  project: null,
  projects: [],
  sessions: [],
  activeSession: null,
  settings: defaultSettings,
  projectSettings: defaultSettings,
  providers: [],
  credentialAvailable: false,
  tab: 'workspace',
  loading: true,
  loadError: null,
  archived: false,
  nextCursor: null,
  setTab: (tab) => set({ tab }),
  refresh: async () => {
    const version = ++revision
    try {
      const boot = await desktop.data('bootstrap', {})
      const project = boot.projects.find((item) => item.id === boot.activeProjectId) ?? null
      const [page, projectSettings, activeSession] = await Promise.all([
        project
          ? desktop.data('sessions.list', {
              projectId: project.id,
              archived: get().archived,
              limit: 20,
            })
          : Promise.resolve({ items: [], nextCursor: null }),
        project
          ? desktop.data('settings.get', { projectId: project.id })
          : Promise.resolve(boot.settings),
        project && boot.activeSessionId
          ? desktop.data('sessions.get', { projectId: project.id, sessionId: boot.activeSessionId })
          : Promise.resolve(null),
      ])
      if (version !== revision) return
      set({
        projects: boot.projects,
        project,
        settings: boot.settings,
        projectSettings,
        providers: boot.providers,
        credentialAvailable: boot.storage.credentialAvailable,
        sessions: page.items,
        nextCursor: page.nextCursor,
        activeSession,
        loading: false,
        loadError: null,
      })
    } catch (error) {
      if (version === revision)
        set({
          loading: false,
          loadError: error instanceof Error ? error.message : '本地数据加载失败',
        })
      throw error
    }
  },
  selectProject: async (id) => {
    await desktop.data('projects.switch', { projectId: id })
    set({ tab: 'workspace', archived: false })
    await get().refresh()
  },
  selectModel: async (providerId, model) => {
    const state = get()
    const projectId = state.project?.id ?? null
    const settings = projectId ? state.projectSettings : state.settings
    const option = modelOptions(state.providers, settings).find(
      (option) => option.providerId === providerId && option.model === model,
    )
    if (!option || option.disabled) throw new Error('模型配置已改变或协议暂未接入，请重新选择')
    await desktop.data('settings.save', {
      projectId,
      settings: { ...settings, defaultProviderId: providerId, defaultModel: model },
    })
    await get().refresh()
  },
  removeProject: async (id) => {
    await desktop.data('projects.remove', { projectId: id })
    await get().refresh()
  },
  newSession: async () => {
    const project = get().project
    if (!project) {
      set({ tab: 'workspace' })
      return
    }
    await desktop.data('sessions.create', { projectId: project.id, title: '新任务' })
    set({ tab: 'workspace', archived: false })
    await get().refresh()
  },
  selectSession: async (id) => {
    const project = get().project
    if (!project) return
    await desktop.data('sessions.select', { projectId: project.id, sessionId: id })
    set({ tab: 'workspace' })
    await get().refresh()
  },
  renameSession: async (id, title) => {
    const project = get().project
    if (!project) return
    await desktop.data('sessions.rename', { projectId: project.id, sessionId: id, title })
    await get().refresh()
  },
  archiveSession: async (id, archived) => {
    const project = get().project
    if (!project) return
    await desktop.data('sessions.archive', { projectId: project.id, sessionId: id, archived })
    await get().refresh()
  },
  showArchived: async (archived) => {
    set({ archived })
    await get().refresh()
  },
  loadMore: async () => {
    const { project, nextCursor, archived } = get()
    if (!project || !nextCursor) return
    const page = await desktop.data('sessions.list', {
      projectId: project.id,
      archived,
      limit: 20,
      cursor: nextCursor,
    })
    if (
      get().project?.id !== project.id ||
      get().archived !== archived ||
      get().nextCursor !== nextCursor
    )
      return
    set({ sessions: [...get().sessions, ...page.items], nextCursor: page.nextCursor })
  },
}))
