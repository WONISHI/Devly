import { z } from 'zod'
import type { Tool } from '../../shared/provider-contracts'
import type { AgentTool } from '../../shared/agent-contracts'
import { planRequestSchema } from '../../shared/agent-contracts'
import type { DatabaseClient } from '../data/client'
import { ApprovalBroker, type ApprovalScope } from './approval-broker'
import { patchRequest } from './patch-executor'
import { applyIsolatedPatch } from './isolated-patch'
import { commandRequest, executeProjectCommand } from './command-executor'
import { ReadOnlyToolbox, readOnlyTools, redactToolText, ToolFailure } from './tools'
import { commandRecord } from './validation'

export const executionTools: Tool[] = [
  ...readOnlyTools,
  {
    name: 'update_plan',
    description:
      'Record a bounded task plan. Completed steps must reference successful tool call IDs from this turn. This updates task metadata only and does not execute project changes.',
    parameters: z.toJSONSchema(planRequestSchema) as Record<string, unknown>,
  },
  {
    name: 'apply_patch',
    description:
      'Propose bounded UTF-8 file replacements or creations inside the project. Read first to obtain contentHash. Every call requires fresh user approval; expectedHash null means the file must not exist. Each file has an independent result. No deletes or extra-directory access.',
    parameters: z.toJSONSchema(patchRequest) as Record<string, unknown>,
  },
  {
    name: 'run_command',
    description:
      'Propose a non-interactive shell command with project-relative cwd, timeout and bounded output. Requires fresh approval. Runs with a minimal environment and macOS filesystem restrictions; network and sensitive paths are denied. Do not start daemons or detach processes.',
    parameters: z.toJSONSchema(commandRequest) as Record<string, unknown>,
  },
]
const queues = new Map<string, Promise<unknown>>()

/** One mutation globally; this also protects overlapping/nested projects from competing writes. */
export async function serializeMutation<T>(
  root: string,
  signal: AbortSignal,
  work: () => Promise<T>,
) {
  const previous = Promise.allSettled([...queues.values()])
  let started = false
  const task = previous
    .catch(() => {})
    .then(() => {
      signal.throwIfAborted()
      started = true
      return work()
    })
  queues.set(root, task)
  const clear = () => {
    if (queues.get(root) === task) queues.delete(root)
  }
  void task.then(clear, clear)
  let abort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => {
      if (!started) reject(new ToolFailure('CANCELLED'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    // Active work must finish cleanup; queued cancellation can settle without waiting for another session.
    return await Promise.race([task, cancelled])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export class ExecutionTools {
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private broker: ApprovalBroker,
    private toolbox: ReadOnlyToolbox,
    private scope: Omit<ApprovalScope, 'callId'>,
    private signal: AbortSignal,
    private secret: string,
    private permitted: () => Promise<boolean>,
  ) {}
  async execute(
    name: string,
    input: string,
    record: AgentTool,
    save: (tool: AgentTool) => Promise<unknown>,
  ): Promise<Record<string, unknown>> {
    if (!['apply_patch', 'run_command'].includes(name)) return this.toolbox.execute(name, input)
    this.signal.throwIfAborted()
    if (!(await this.permitted())) throw new ToolFailure('PERMISSION_DENIED')
    let raw: unknown
    try {
      raw = JSON.parse(input)
    } catch {
      throw new ToolFailure('INVALID_JSON')
    }
    const parsed = (name === 'apply_patch' ? patchRequest : commandRequest).safeParse(raw)
    if (!parsed.success) throw new ToolFailure('INVALID_ARGUMENTS')
    // Secrets in a proposal must never be written to files, subprocess arguments or approval records.
    if (redactToolText(JSON.stringify(parsed.data), this.secret) !== JSON.stringify(parsed.data))
      throw new ToolFailure('SENSITIVE_CONTENT')
    const scope = { ...this.scope, callId: record.callId }
    const { request, decision } = this.broker.request(
      scope,
      name as 'apply_patch' | 'run_command',
      parsed.data,
      this.signal,
    )
    record.approval = {
      id: request.id,
      digest: request.digest,
      expiresAt: request.expiresAt,
      state: 'pending',
    }
    record.state = 'waiting_approval'
    try {
      await save(record)
      await this.database.execute('internal.chat.approval', {
        ...this.scope,
        toolId: record.id,
        approval: record.approval,
      })
      await this.database.execute('internal.chat.update', {
        ...this.scope,
        phase: 'waiting_approval',
      })
      const allowed = await decision
      record.approval.state = this.signal.aborted
        ? 'cancelled'
        : Date.now() >= request.expiresAt
          ? 'expired'
          : allowed
            ? 'approved'
            : 'denied'
      await this.database.execute('internal.chat.approval', {
        ...this.scope,
        toolId: record.id,
        approval: record.approval,
      })
      await save(record)
      this.signal.throwIfAborted()
      await this.database.execute('internal.chat.update', { ...this.scope, phase: 'running' })
      if (!allowed)
        throw new ToolFailure(
          record.approval.state === 'expired' ? 'APPROVAL_EXPIRED' : 'APPROVAL_DENIED',
        )
      record.state = 'queued'
      await save(record)
      return await serializeMutation(this.toolbox.root, this.signal, async () => {
        if (Date.now() >= request.expiresAt) {
          record.approval!.state = 'expired'
          await this.database.execute('internal.chat.approval', {
            ...this.scope,
            toolId: record.id,
            approval: record.approval,
          })
          throw new ToolFailure('APPROVAL_EXPIRED')
        }
        if (!(await this.permitted())) throw new ToolFailure('PERMISSION_DENIED')
        record.state = 'running'
        await save(record)
        if (name === 'apply_patch') {
          const results = await applyIsolatedPatch(
            this.toolbox.root,
            patchRequest.parse(parsed.data),
            this.signal,
          ).catch((error) => {
            if (!this.signal.aborted) throw new ToolFailure('EXECUTION_STATE_UNKNOWN')
            throw error
          })
          return {
            results,
            failed: results.some((item) => item.state !== 'applied'),
            partial:
              results.some((item) => item.state === 'applied') &&
              results.some((item) => item.state !== 'applied'),
          }
        }
        const started = performance.now()
        const result = await executeProjectCommand(
          this.toolbox.root,
          commandRequest.parse(parsed.data),
          this.signal,
          (stream, text) => {
            record.output = (record.output + `${stream}: ${text}`).slice(-16000)
            // Updates are serialized by DatabaseClient. Final output below remains authoritative.
            void save({ ...record }).catch(() => {})
          },
          this.secret,
        )
        record.execution = commandRecord(result, performance.now() - started)
        if (result.state === 'unknown') throw new ToolFailure('EXECUTION_STATE_UNKNOWN')
        return {
          ...result,
          failed:
            result.state !== 'completed' ||
            record.execution.validation.state === 'conflict' ||
            (record.execution.validation.state === 'complete' &&
              record.execution.validation.failed > 0),
          truncated: result.state === 'output_limit',
        }
      })
    } finally {
      this.broker.revoke(request.id)
    }
  }
}
