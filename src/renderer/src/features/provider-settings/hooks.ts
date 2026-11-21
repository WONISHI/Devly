import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import type { Settings } from '@shared/data-contracts'
export async function savePreferences(projectId: string | null, settings: Settings): Promise<void> {
  await desktop.data('settings.save', { projectId, settings })
  await useWorkspace.getState().refresh()
}
export async function changeCredential(providerId: string, clear = false): Promise<void> {
  if (clear) await desktop.data('credentials.clear', { providerId })
  else await desktop.data('credentials.set', { providerId })
  await useWorkspace.getState().refresh()
}

export async function exportPreferences(projectId: string | null): Promise<void> {
  await desktop.data('settings.export', { projectId })
}
