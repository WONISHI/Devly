import { create } from 'zustand'
import { useLayoutStore } from '@/features/desktop/layout-store'
export const useTerminalWorkspace = create<{
  visible: Record<string, boolean>
  show: (projectId: string) => void
  hide: (projectId: string) => void
  toggle: (projectId: string) => void
}>((set) => ({
  visible: {},
  show: (projectId) => {
    useLayoutStore.getState().patch(projectId, { showTerminal: true })
    set((state) => ({ visible: { ...state.visible, [projectId]: true } }))
  },
  hide: (projectId) => {
    useLayoutStore.getState().patch(projectId, { showTerminal: false })
    set((state) => ({ visible: { ...state.visible, [projectId]: false } }))
  },
  toggle: (projectId) =>
    set((state) => {
      const visible = !state.visible[projectId]
      useLayoutStore.getState().patch(projectId, { showTerminal: visible })
      return { visible: { ...state.visible, [projectId]: visible } }
    }),
}))
