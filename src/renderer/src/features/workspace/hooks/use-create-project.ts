import { useCallback } from 'react'
import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
export function useCreateProject() {
  return useCallback(async () => {
    const project = await desktop.data('projects.create', {})
    if (project) {
      useWorkspace.getState().setTab('workspace')
      await useWorkspace.getState().refresh()
    }
  }, [])
}
