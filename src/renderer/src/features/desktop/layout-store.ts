import { create } from 'zustand'
import { desktop } from '@/platform/desktop'
import { defaultLayout, layoutSchema, type DesktopLayout } from '@shared/workbench-contracts'
const keyOf = (projectId: string | null) => projectId ?? 'global'
const loading = new Map<string, Promise<void>>(),
  timers = new Map<string, ReturnType<typeof setTimeout>>(),
  queues = new Map<string, Promise<void>>()
type State = {
  layouts: Record<string, DesktopLayout>
  loaded: Record<string, boolean>
  pending: Record<string, Partial<DesktopLayout>>
  errors: Record<string, string>
  load: (projectId: string | null) => Promise<void>
  patch: (projectId: string | null, change: Partial<DesktopLayout>) => void
  flush: (projectId: string | null) => Promise<void>
}
export const useLayoutStore = create<State>((set, get) => ({
  layouts: {},
  loaded: {},
  pending: {},
  errors: {},
  load: async (projectId) => {
    const key = keyOf(projectId)
    if (get().loaded[key]) return
    if (loading.has(key)) return loading.get(key)
    const task = (async () => {
      try {
        const saved = await desktop.data('layout.get', { projectId })
        const pending = get().pending[key] ?? {}
        set((state) => ({
          layouts: { ...state.layouts, [key]: { ...saved, ...pending } },
          loaded: { ...state.loaded, [key]: true },
          errors: { ...state.errors, [key]: '' },
        }))
        if (Object.keys(pending).length) await get().flush(projectId)
      } catch {
        set((state) => ({ errors: { ...state.errors, [key]: '布局读取失败，当前使用临时布局' } }))
      }
    })()
    loading.set(key, task)
    try {
      await task
    } finally {
      loading.delete(key)
    }
  },
  patch: (projectId, change) => {
    const key = keyOf(projectId),
      old = get().layouts[key] ?? defaultLayout,
      next = layoutSchema.parse({ ...old, ...change })
    if (JSON.stringify(old) === JSON.stringify(next)) return
    set((state) => ({
      layouts: { ...state.layouts, [key]: next },
      pending: { ...state.pending, [key]: { ...state.pending[key], ...change } },
    }))
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        void get().flush(projectId)
      }, 180),
    )
  },
  flush: async (projectId) => {
    const key = keyOf(projectId)
    clearTimeout(timers.get(key))
    timers.delete(key)
    if (!get().loaded[key]) return
    const value = get().layouts[key] ?? defaultLayout
    const prior = queues.get(key) ?? Promise.resolve()
    const task = prior
      .catch(() => {})
      .then(async () => {
        try {
          await desktop.data('layout.save', { projectId, layout: value })
          set((state) => ({ errors: { ...state.errors, [key]: '' } }))
        } catch {
          set((state) => ({
            errors: { ...state.errors, [key]: '布局未保存，请检查本地存储后重新调整' },
          }))
        }
      })
    queues.set(key, task)
    await task
    if (queues.get(key) === task) queues.delete(key)
  },
}))
export const layoutKey = keyOf
export const currentLayout = (projectId: string | null) =>
  useLayoutStore.getState().layouts[keyOf(projectId)] ?? defaultLayout
