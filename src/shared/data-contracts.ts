import { z } from 'zod'
import {
  chatSnapshotSchema,
  chatTurnSchema,
  chatErrorSchema,
  turnStateSchema,
} from './chat-contracts'
import { usageSchema } from './provider-contracts'
import {
  agentLimitsSchema,
  defaultAgentLimits,
  agentInfoSchema,
  agentToolSchema,
} from './agent-contracts'
import {
  compatibilitySchema,
  providerReportSchema,
  probeKind,
  probeSnapshotSchema,
} from './provider-contracts'

export const entityId = z.uuid()
const text = z.string().trim().min(1).max(200)
export const settingsSchema = z
  .object({
    version: z.literal(1),
    theme: z.enum(['dark', 'light', 'system']),
    defaultProviderId: entityId.nullable(),
    defaultModel: z.string().max(200),
    projectPermission: z.enum(['read-only', 'ask']),
    maxTokens: z.number().int().min(256).max(1000000),
    maxCost: z.number().finite().min(0).max(10000),
    agentLimits: agentLimitsSchema.default(defaultAgentLimits),
  })
  .strict()
export type Settings = z.infer<typeof settingsSchema>
export const defaultSettings: Settings = {
  version: 1,
  theme: 'dark',
  defaultProviderId: null,
  defaultModel: '',
  projectPermission: 'read-only',
  maxTokens: 8192,
  maxCost: 5,
  agentLimits: defaultAgentLimits,
}
export const recentProjectSchema = z
  .object({
    id: entityId,
    path: z.string(),
    name: text,
    lastOpenedAt: z.number().int(),
    available: z.boolean(),
    managed: z.boolean().default(false),
  })
  .strict()
export type RecentProject = z.infer<typeof recentProjectSchema>
export const providerInputSchema = z
  .object({
    id: entityId.optional(),
    name: text,
    protocol: z.enum(['chat-completions', 'responses', 'anthropic-messages']),
    baseUrl: z
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value)
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        )
      }, 'Invalid API endpoint'),
    model: z.string().max(200),
    compatibility: compatibilitySchema.optional(),
  })
  .strict()
export const providerSchema = providerInputSchema
  .omit({ id: true })
  .extend({
    id: entityId,
    hasCredential: z.boolean(),
    revision: z.number().int().positive().default(1),
    compatibility: compatibilitySchema.default({
      tokenParameter: 'max_tokens',
      temperature: null,
      streamUsage: false,
      tools: 'auto',
      vision: 'unknown',
      structuredOutput: 'unknown',
      contextWindow: null,
    }),
    report: providerReportSchema.nullable().default(null),
  })
  .strict()
export type Provider = z.infer<typeof providerSchema>
export const sessionSchema = z
  .object({
    id: entityId,
    projectId: entityId,
    title: text,
    archived: z.boolean(),
    updatedAt: z.number().int(),
    providerId: entityId.nullable().default(null),
    model: z.string().max(200).default(''),
    hasMessages: z.boolean().default(false),
  })
  .strict()
export type Session = z.infer<typeof sessionSchema>
export const cursorSchema = z
  .object({ time: z.number().int().nonnegative(), id: entityId })
  .strict()
const project = z.object({ projectId: entityId }).strict()
const session = project.extend({ sessionId: entityId }).strict()
const page = {
  limit: z.number().int().min(1).max(100).default(30),
  cursor: cursorSchema.nullable().default(null),
}
export const blobSchema = session
  .extend({
    id: entityId,
    kind: z.enum(['log', 'attachment']),
    name: z.string(),
    mime: z.string(),
    bytes: z.number().int().nonnegative(),
    createdAt: z.number().int(),
  })
  .strict()
export const operationArgs = {
  bootstrap: z.object({}).strict(),
  'projects.list': z.object({}).strict(),
  'projects.create': z.object({}).strict(),
  'projects.switch': project,
  'projects.remove': project,
  'providers.list': z.object({}).strict(),
  'providers.save': providerInputSchema,
  'providers.remove': z.object({ providerId: entityId }).strict(),
  'providers.probe.start': z
    .object({
      providerId: entityId,
      runId: entityId,
      kind: z.union([probeKind, z.literal('all')]),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    })
    .strict(),
  'providers.probe.read': z.object({ runId: entityId }).strict(),
  'providers.probe.cancel': z.object({ runId: entityId }).strict(),
  'providers.probe.release': z.object({ runId: entityId }).strict(),
  'credentials.set': z.object({ providerId: entityId }).strict(),
  'credentials.clear': z.object({ providerId: entityId }).strict(),
  'settings.export': z.object({ projectId: entityId.nullable() }).strict(),
  'settings.get': z.object({ projectId: entityId.nullable() }).strict(),
  'settings.save': z.object({ projectId: entityId.nullable(), settings: settingsSchema }).strict(),
  'sessions.create': project.extend({ title: text.default('新会话') }).strict(),
  'sessions.general': z.object({}).strict(),
  'sessions.list': project.extend({ archived: z.boolean().default(false), ...page }).strict(),
  'sessions.recent': z.object({ archived: z.boolean().default(false), ...page }).strict(),
  'sessions.rename': session.extend({ title: text }).strict(),
  'sessions.archive': session.extend({ archived: z.boolean() }).strict(),
  'sessions.get': session,
  'sessions.select': session,
  'sessions.bind': session
    .extend({
      providerId: entityId,
      model: z.string().trim().min(1).max(200),
      allowHistory: z.boolean().default(false),
      setDefault: z.boolean().default(false),
    })
    .strict(),
  'sessions.messages': session.extend(page).strict(),
  'chat.start': session
    .extend({
      turnId: entityId,
      text: z.string().trim().min(1).max(32768),
      expectedProviderId: entityId,
      expectedModel: z.string().trim().min(1).max(200),
      mode: z.enum(['chat', 'read-only']).default('chat'),
      selectedPaths: z.array(z.string().min(1).max(1000)).max(12).default([]),
    })
    .strict(),
  'chat.read': session,
  'chat.cancel': session.extend({ turnId: entityId }).strict(),
  'blobs.import': session.extend({ kind: z.enum(['log', 'attachment']) }).strict(),
  'blobs.list': session.extend(page).strict(),
  'blobs.read': session
    .extend({
      blobId: entityId,
      offset: z.number().int().nonnegative().default(0),
      length: z.number().int().min(1).max(65536).default(16384),
    })
    .strict(),
  'blobs.remove': session.extend({ blobId: entityId }).strict(),
  'blobs.prune': session.extend({ before: z.number().int().nonnegative() }).strict(),
} as const
export type DataOperation = keyof typeof operationArgs
export type DataArgs<K extends DataOperation> = z.input<(typeof operationArgs)[K]>
export const operations = Object.keys(operationArgs) as [DataOperation, ...DataOperation[]]
export const messageSchema = z
  .object({
    id: entityId,
    sessionId: entityId,
    role: z.enum(['user', 'assistant', 'tool']),
    createdAt: z.number().int(),
    turnId: entityId.nullable().default(null),
    state: turnStateSchema.nullable().default(null),
    error: chatErrorSchema.nullable().default(null),
    usage: usageSchema.nullable().default(null),
    finish: z.string().nullable().default(null),
    providerId: entityId.nullable().default(null),
    model: z.string().max(200).default(''),
    agent: agentInfoSchema.default({
      mode: 'chat',
      sources: [],
      summaries: [],
      rounds: 0,
      calls: 0,
    }),
    tools: z.array(agentToolSchema).max(40).default([]),
    parts: z.array(
      z
        .object({
          id: entityId,
          type: z.enum(['text', 'blob']),
          text: z.string().nullable(),
          blobId: entityId.nullable(),
        })
        .strict(),
    ),
  })
  .strict()
const sessionPage = z
  .object({ items: z.array(sessionSchema), nextCursor: cursorSchema.nullable() })
  .strict()
export const bootstrapSchema = z
  .object({
    projects: z.array(recentProjectSchema),
    activeProjectId: entityId.nullable(),
    activeSessionId: entityId.nullable(),
    settings: settingsSchema,
    providers: z.array(providerSchema),
    storage: z
      .object({ schemaVersion: z.number().int(), credentialAvailable: z.boolean() })
      .strict(),
  })
  .strict()
export type Bootstrap = z.infer<typeof bootstrapSchema>
export type ChatMessage = z.infer<typeof messageSchema>
const ack = z.object({ removed: z.boolean() }).strict()
export const operationResults = {
  bootstrap: bootstrapSchema,
  'projects.list': z.array(recentProjectSchema),
  'projects.create': recentProjectSchema.nullable(),
  'projects.switch': recentProjectSchema,
  'projects.remove': ack,
  'providers.list': z.array(providerSchema),
  'providers.save': providerSchema,
  'providers.remove': ack,
  'providers.probe.start': z.object({ runId: entityId }).strict(),
  'providers.probe.read': probeSnapshotSchema,
  'providers.probe.cancel': ack,
  'providers.probe.release': ack,
  'credentials.set': z.object({ saved: z.boolean() }).strict(),
  'credentials.clear': ack,
  'settings.export': z.object({ saved: z.boolean() }).strict(),
  'settings.get': settingsSchema,
  'settings.save': settingsSchema,
  'sessions.create': sessionSchema,
  'sessions.general': sessionSchema,
  'sessions.list': sessionPage,
  'sessions.recent': sessionPage,
  'sessions.rename': sessionSchema,
  'sessions.archive': sessionSchema,
  'sessions.get': sessionSchema,
  'sessions.select': sessionSchema,
  'sessions.bind': sessionSchema,
  'chat.start': chatTurnSchema,
  'chat.read': chatSnapshotSchema,
  'chat.cancel': ack,
  'sessions.messages': z
    .object({ items: z.array(messageSchema), nextCursor: cursorSchema.nullable() })
    .strict(),
  'blobs.import': blobSchema.nullable(),
  'blobs.list': z
    .object({ items: z.array(blobSchema), nextCursor: cursorSchema.nullable() })
    .strict(),
  'blobs.read': z
    .object({
      base64: z.string(),
      offset: z.number().int(),
      total: z.number().int(),
      truncated: z.boolean(),
    })
    .strict(),
  'blobs.remove': ack,
  'blobs.prune': z.object({ removed: z.number().int() }).strict(),
} as const
export type DataResult<K extends DataOperation> = z.infer<(typeof operationResults)[K]>
export const dataPayloadSchema = z
  .object({ operation: z.enum(operations), args: z.unknown() })
  .strict()
  .superRefine((value, ctx) => {
    if (!operationArgs[value.operation].safeParse(value.args).success)
      ctx.addIssue({ code: 'custom', message: 'Invalid operation arguments' })
  })
export const dataResponseSchema = z
  .object({ operation: z.enum(operations), data: z.unknown() })
  .strict()
  .superRefine((value, ctx) => {
    if (!operationResults[value.operation].safeParse(value.data).success)
      ctx.addIssue({ code: 'custom', message: 'Invalid operation result' })
  })
