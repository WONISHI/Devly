import { create } from 'zustand'
import type { Project } from '../../shared/contracts'
export type WorkspaceTab = 'workspace' | 'components'
type WorkspaceState = {
  project: Project | null
  tab: WorkspaceTab
  setProject: (project: Project) => void
  setTab: (tab: WorkspaceState['tab']) => void
}
export const useWorkspace = create<WorkspaceState>((set) => ({
  project: null,
  tab: 'workspace',
  setProject: (project) => set({ project }),
  setTab: (tab) => set({ tab }),
}))
