import { z } from 'zod'

export const agentLimitsSchema = z
  .object({
    maxCalls: z.number().int().min(1).max(40).default(16),
    maxRounds: z.number().int().min(1).max(20).default(8),
    maxDurationMs: z.number().int().min(1000).max(300000).default(120000),
    maxOutputChars: z.number().int().min(1024).max(262144).default(65536),
    contextChars: z.number().int().min(4096).max(200000).default(48000),
  })
  .strict()
export type AgentLimits = z.infer<typeof agentLimitsSchema>
export const defaultAgentLimits = agentLimitsSchema.parse({})
export const agentToolSchema = z
  .object({
    id: z.uuid(),
    callId: z.string().max(200),
    name: z.string().max(200),
    state: z.enum(['proposed', 'running', 'completed', 'failed', 'cancelled']),
    input: z.string().max(262144),
    output: z.string().max(16384),
    error: z.string().max(200).nullable(),
    truncated: z.boolean(),
    blobId: z.uuid().nullable(),
    position: z.number().int().nonnegative(),
  })
  .strict()
export type AgentTool = z.infer<typeof agentToolSchema>
export const contextSourceSchema = z
  .object({
    kind: z.enum(['policy', 'history', 'instruction', 'selected', 'summary', 'tool']),
    path: z.string().max(1000),
    chars: z.number().int().nonnegative(),
  })
  .strict()
export const agentInfoSchema = z
  .object({
    mode: z.enum(['chat', 'read-only']).default('chat'),
    sources: z.array(contextSourceSchema).max(100).default([]),
    summaries: z.array(z.string().max(2000)).max(20).default([]),
    rounds: z.number().int().nonnegative().default(0),
    calls: z.number().int().nonnegative().default(0),
  })
  .strict()
export type AgentInfo = z.infer<typeof agentInfoSchema>
