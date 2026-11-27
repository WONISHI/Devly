import type { AttachmentInfo } from '@shared/attachment-contracts'
type Draft = {
  text: string
  attachments: AttachmentInfo[]
  scope: { projectId: string; sessionId: string }
  mode: 'chat' | 'read-only' | 'project-write'
  paths: string
  delegation: boolean
}
// A native attachment creates the session before the renderer selects it. Preserve
// that one draft across the keyed component's new-session -> real-session promotion.
const handoffs = new Map<string, Draft>()
export function handoffAttachmentDraft(draft: Draft) {
  if (handoffs.size >= 20) handoffs.delete(handoffs.keys().next().value!)
  handoffs.set(draft.scope.sessionId, draft)
}
export function readAttachmentDraft(sessionId?: string) {
  return sessionId ? handoffs.get(sessionId) : undefined
}
export function clearAttachmentDraft(draft: Draft) {
  if (handoffs.get(draft.scope.sessionId) === draft) handoffs.delete(draft.scope.sessionId)
}
