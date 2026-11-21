import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import type { Settings } from '@shared/data-contracts'

export async function changeChatModel(input: {
  projectId: string | null
  sessionId: string | null
  settings: Settings
  providerId: string
  model: string
  newSession: boolean
  allowHistory: boolean
}): Promise<void> {
  // Keep the initiating scope when navigation occurs during an await.
  try {
    let sessionId = input.sessionId
    if (input.newSession && input.projectId)
      sessionId = (
        await desktop.data('sessions.create', { projectId: input.projectId, title: '新任务' })
      ).id
    if (input.projectId && sessionId) {
      await desktop.data('sessions.bind', {
        projectId: input.projectId,
        sessionId,
        providerId: input.providerId,
        model: input.model,
        allowHistory: input.allowHistory,
        setDefault: true,
      })
    } else {
      await desktop.data('settings.save', {
        projectId: input.projectId,
        settings: {
          ...input.settings,
          defaultProviderId: input.providerId,
          defaultModel: input.model,
        },
      })
    }
  } finally {
    await useWorkspace.getState().refresh()
  }
}
