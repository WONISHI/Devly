import { useCallback } from 'react'
import { toast } from 'sonner'
import { desktop, DesktopUnavailableError } from '@/platform/desktop'
import { useWorkspace } from '@/store'

export function useOpenProject() {
  const refresh = useWorkspace((state) => state.refresh)
  return useCallback(async () => {
    try {
      const selected = await desktop.openProject()
      if (selected) await refresh()
    } catch (error) {
      if (error instanceof DesktopUnavailableError) toast.info(error.message)
      else toast.error(error instanceof Error ? error.message : '打开项目失败')
    }
  }, [refresh])
}
