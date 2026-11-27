import { createHash, randomUUID } from 'node:crypto'

export type ApprovalScope = { projectId: string; sessionId: string; turnId: string; callId: string }
export type PendingApproval = ApprovalScope & {
  id: string
  operation:
    'apply_patch' | 'run_command' | 'mcp_call' | 'spawn_agent' | 'web_request' | 'browser_action'
  digest: string
  expiresAt: number
}

/** Immutable, single-use grants bound to the full original request; never a session-wide allow flag. */
export class ApprovalBroker {
  private pending = new Map<
    string,
    { request: PendingApproval; settle: (value: boolean) => void; cleanup: () => void }
  >()
  request(
    scope: ApprovalScope,
    operation: PendingApproval['operation'],
    parameters: unknown,
    signal: AbortSignal,
    ttlMs = 60000,
  ) {
    signal.throwIfAborted()
    if (this.pending.size >= 40) throw new Error('APPROVAL_LIMIT')
    const request: PendingApproval = Object.freeze({
      ...scope,
      id: randomUUID(),
      operation,
      digest: createHash('sha256').update(JSON.stringify(parameters)).digest('hex'),
      expiresAt: Date.now() + ttlMs,
    })
    const decision = new Promise<boolean>((settle) => {
      const cancel = () => {
        const entry = this.pending.get(request.id)
        if (entry) {
          this.pending.delete(request.id)
          entry.cleanup()
          settle(false)
        }
      }
      const timeout = setTimeout(cancel, ttlMs)
      signal.addEventListener('abort', cancel, { once: true })
      this.pending.set(request.id, {
        request,
        settle,
        cleanup: () => {
          clearTimeout(timeout)
          signal.removeEventListener('abort', cancel)
        },
      })
      if (signal.aborted) cancel()
    })
    return { request, decision }
  }
  respond(scope: ApprovalScope, id: string, digest: string, allowed: boolean): boolean {
    const entry = this.pending.get(id)
    if (
      !entry ||
      entry.request.digest !== digest ||
      entry.request.expiresAt <= Date.now() ||
      (['projectId', 'sessionId', 'turnId', 'callId'] as const).some(
        (key) => entry.request[key] !== scope[key],
      )
    )
      return false
    this.pending.delete(id)
    entry.cleanup()
    entry.settle(allowed)
    return true
  }
  revoke(id: string) {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    entry.cleanup()
    entry.settle(false)
  }
  close() {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id)
      entry.cleanup()
      entry.settle(false)
    }
  }
}
