import { z } from 'zod'
import { commandRecordSchema } from './execution-records'

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
    state: z.enum([
      'proposed',
      'waiting_approval',
      'queued',
      'running',
      'completed',
      'failed',
      'denied',
      'cancelled',
    ]),
    approval: z
      .object({
        id: z.uuid(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        expiresAt: z.number().int(),
        state: z.enum(['pending', 'approved', 'denied', 'expired', 'cancelled']),
      })
      .strict()
      .nullable()
      .default(null),
    origin: z
      .object({
        kind: z.literal('mcp'),
        serverId: z.uuid(),
        serverName: z.string().max(100),
        url: z.string().max(2048),
        toolName: z.string().max(200),
        schemaHash: z.string().length(64),
      })
      .strict()
      .nullable()
      .optional(),
    input: z.string().max(262144),
    output: z.string().max(16384),
    error: z.string().max(200).nullable(),
    execution: commandRecordSchema.nullable().default(null),
    truncated: z.boolean(),
    blobId: z.uuid().nullable(),
    position: z.number().int().nonnegative(),
  })
  .strict()
export type AgentTool = z.infer<typeof agentToolSchema>
export const planRequestSchema = z
  .object({
    steps: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            title: z.string().min(1).max(200),
            state: z.enum(['pending', 'running', 'completed']),
            callIds: z.array(z.string().min(1).max(200)).max(40).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.steps.map((step) => step.id)).size === value.steps.length &&
      value.steps.filter((step) => step.state === 'running').length <= 1,
  )
export const contextSourceSchema = z
  .object({
    kind: z.enum([
      'policy',
      'history',
      'instruction',
      'selected',
      'summary',
      'tool',
      'memory',
      'skill',
    ]),
    path: z.string().max(1000),
    chars: z.number().int().nonnegative(),
  })
  .strict()
export const gitBaselineSchema = z
  .object({
    root: z.string().max(8192).nullable(),
    head: z.string().max(64).nullable(),
    entries: z.array(z.string().max(8192)).max(10000),
    fingerprint: z.string().max(64),
    available: z.boolean(),
  })
  .strict()
export const taskFamilySchema = z
  .object({
    rootTurnId: z.uuid(),
    parentTurnId: z.uuid().nullable(),
    workspaceId: z.uuid().nullable(),
    contextProjectId: z.uuid(),
    depth: z.number().int().min(0).max(1),
    permissionCeiling: z.enum(['read-only', 'project-write']),
    allocation: z
      .object({
        tokens: z.number().int(),
        calls: z.number().int(),
        outputChars: z.number().int(),
        durationMs: z.number().int(),
      })
      .strict(),
    remaining: z
      .object({
        tokens: z.number().int(),
        calls: z.number().int(),
        outputChars: z.number().int(),
        durationMs: z.number().int(),
      })
      .strict(),
    children: z
      .array(
        z
          .object({
            turnId: z.uuid(),
            projectId: z.uuid(),
            sessionId: z.uuid(),
            workspaceId: z.uuid(),
          })
          .strict(),
      )
      .max(2),
  })
  .strict()
export const agentInfoSchema = z
  .object({
    mode: z.enum(['chat', 'read-only', 'project-write']).default('chat'),
    family: taskFamilySchema.optional(),
    plan: planRequestSchema.shape.steps.optional(),
    context: z
      .object({
        estimatedTokens: z.number().int().nonnegative(),
        windowTokens: z.number().int().positive().nullable(),
        characters: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    git: z
      .object({ before: gitBaselineSchema, after: gitBaselineSchema.nullable() })
      .strict()
      .nullable()
      .default(null),
    sources: z.array(contextSourceSchema).max(100).default([]),
    summaries: z.array(z.string().max(2000)).max(20).default([]),
    rounds: z.number().int().nonnegative().default(0),
    calls: z.number().int().nonnegative().default(0),
  })
  .strict()
export type AgentInfo = z.infer<typeof agentInfoSchema>
