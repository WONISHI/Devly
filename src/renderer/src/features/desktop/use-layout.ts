import { useEffect } from 'react'
import { defaultLayout, type DesktopLayout } from '@shared/workbench-contracts'
import { useLayoutStore, layoutKey } from './layout-store'
export function useDesktopLayout(projectId: string | null) {
  const key = layoutKey(projectId),
    layout = useLayoutStore((state) => state.layouts[key] ?? defaultLayout),
    ready = useLayoutStore((state) => !!state.loaded[key]),
    error = useLayoutStore((state) => state.errors[key])
  useEffect(() => {
    void useLayoutStore.getState().load(projectId)
  }, [projectId])
  return {
    layout,
    ready,
    error,
    patch: (change: Partial<DesktopLayout>) => useLayoutStore.getState().patch(projectId, change),
    flush: () => useLayoutStore.getState().flush(projectId),
  }
}
