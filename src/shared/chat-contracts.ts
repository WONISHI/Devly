import { z } from 'zod'
import { providerErrorSchema, usageSchema } from './provider-contracts'

export const turnStateSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled'])
export const taskPhaseSchema = z.enum([
  'pending',
  'running',
  'waiting_approval',
  'stopping',
  'completed',
  'failed',
  'cancelled',
])
export type TaskPhase = z.infer<typeof taskPhaseSchema>
// waiting_approval is reserved for the Agent phase; ordinary chat never invents approvals/tools.
const transitions: Record<TaskPhase, TaskPhase[]> = {
  pending: ['running', 'stopping', 'failed', 'cancelled'],
  running: ['waiting_approval', 'stopping', 'completed', 'failed', 'cancelled'],
  waiting_approval: ['running', 'stopping', 'failed', 'cancelled'],
  stopping: ['cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
}
export function canTransition(from: TaskPhase, to: TaskPhase): boolean {
  return from === to || transitions[from].includes(to)
}
export const toolStateSchema = z.enum([
  'proposed',
  'validating',
  'waiting_approval',
  'running',
  'completed',
  'failed',
  'denied',
  'cancelled',
])
export const chatErrorSchema = providerErrorSchema.extend({
  code: z.union([providerErrorSchema.shape.code, z.literal('INTERRUPTED'), z.literal('STORAGE')]),
})
export type ChatError = z.infer<typeof chatErrorSchema>
export const chatTurnSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    sessionId: z.uuid(),
    providerId: z.uuid().nullable(),
    model: z.string().max(200),
    state: turnStateSchema,
    phase: taskPhaseSchema,
    userMessageId: z.uuid().nullable(),
    assistantMessageId: z.uuid().nullable(),
    startedAt: z.number().int().nullable(),
    endedAt: z.number().int().nullable(),
    usage: usageSchema.nullable(),
    finish: z.enum(['stop', 'length', 'filtered', 'tools', 'unknown']).nullable(),
    error: chatErrorSchema.nullable(),
  })
  .strict()
export type ChatTurn = z.infer<typeof chatTurnSchema>
export const chatSnapshotSchema = z
  .object({
    turn: chatTurnSchema.nullable(),
    text: z.string().max(262144),
  })
  .strict()
export type ChatSnapshot = z.infer<typeof chatSnapshotSchema>
export const isGenerating = (state: string | undefined) =>
  state === 'pending' || state === 'running'
