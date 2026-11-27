import { chatTurnSchema } from './chat-contracts'
import { z } from 'zod'
export const projectScope = z.object({ projectId: z.uuid() }).strict()
export const scopedPath = z
  .string()
  .max(1000)
  .refine(
    (value) =>
      value === '.' ||
      (!!value &&
        !value.startsWith('/') &&
        !value.includes('\\') &&
        !value.includes('\0') &&
        value.split('/').every((part) => part && part !== '.' && part !== '..')),
  )
export const contextInput = projectScope
  .extend({
    id: z.uuid().optional(),
    kind: z.enum(['instruction', 'memory']),
    name: z.string().trim().min(1).max(100),
    scope: scopedPath.default('.'),
    content: z.string().trim().min(1).max(8192),
    enabled: z.boolean().default(true),
  })
  .strict()
export const contextRecord = contextInput
  .extend({ id: z.uuid(), source: z.literal('user'), updatedAt: z.number().int() })
  .strict()
export type ContextRecord = z.infer<typeof contextRecord>
export const taskSummary = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    sessionId: z.uuid(),
    title: z.string(),
    mode: z.enum(['chat', 'read-only', 'project-write']),
    state: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
    phase: z.string(),
    startedAt: z.number().nullable(),
    parentTurnId: z.uuid().nullable().default(null),
    rootTurnId: z.uuid().nullable().default(null),
    workspaceId: z.uuid().nullable().default(null),
  })
  .strict()
export const managedWorkspace = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    workspaceProjectId: z.uuid().nullable(),
    path: z.string().max(8192),
    branch: z.string().max(100),
    targetBranch: z.string().max(512).nullable().default(null),
    base: z.string().regex(/^[a-f0-9]{40,64}$/),
    state: z.enum(['ready', 'closed']),
    createdAt: z.number().int(),
  })
  .strict()
export type ManagedWorkspace = z.infer<typeof managedWorkspace>
const workspaceScope = projectScope.extend({ workspaceId: z.uuid() }).strict()
const workspaceReview = z
  .object({
    workspace: managedWorkspace,
    mainHead: z.string(),
    mainBranch: z.string().nullable(),
    head: z.string(),
    dirty: z.boolean(),
    conflicts: z.boolean(),
    paths: z.array(z.string()).max(200),
    preservedRecoveryFiles: z.array(z.string()).max(200),
    diff: z.string().max(100000),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const workspaceOutcome = z
  .object({ ok: z.boolean(), code: z.string(), message: z.string() })
  .strict()
export const mcpInput = projectScope
  .extend({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(100),
    url: z
      .url()
      .max(2048)
      .refine((value) => {
        const u = new URL(value)
        return (
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          (u.protocol === 'https:' ||
            (u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname)))
        )
      }),
    enabled: z.boolean().default(false),
  })
  .strict()
export const mcpServer = mcpInput
  .extend({ id: z.uuid(), revision: z.number().int().positive(), hasCredential: z.boolean() })
  .strict()
export type McpServerConfig = z.infer<typeof mcpServer>
const mcpScope = projectScope.extend({ serverId: z.uuid() }).strict()
export const mcpTool = z
  .object({
    name: z.string().max(200),
    alias: z.string().max(100),
    description: z.string().max(500),
    parameters: z.record(z.string(), z.unknown()),
    schemaHash: z.string().length(64),
  })
  .strict()
export type McpTool = z.infer<typeof mcpTool>
export const skillPath = z
  .string()
  .max(1000)
  .regex(/^\.(?:agents|claude|devly)\/skills\/[a-zA-Z0-9_-]{1,64}\/SKILL\.md$/)
export const skillSelection = z
  .object({ path: skillPath, hash: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
export const skillInfo = skillSelection
  .extend({
    name: z.string().max(100),
    description: z.string().max(500),
    content: z.string().max(16384),
    enabled: z.boolean(),
    changed: z.boolean(),
  })
  .strict()
export type SkillInfo = z.infer<typeof skillInfo>
export const extensionArguments = {
  'skills.discover': projectScope,
  'skills.read': projectScope.extend({ path: skillPath }).strict(),
  'skills.select': projectScope.extend({ entries: z.array(skillSelection).max(8) }).strict(),

  'mcp.servers': projectScope,
  'mcp.save': mcpInput,
  'mcp.remove': mcpScope,
  'mcp.connect': mcpScope,
  'mcp.credentials.set': mcpScope,
  'mcp.credentials.clear': mcpScope,

  'tasks.open': projectScope.extend({ turnId: z.uuid() }).strict(),
  'tasks.start': projectScope
    .extend({
      workspaceId: z.uuid().nullable().default(null),
      allowDelegation: z.boolean().default(false),
      providerId: z.uuid(),
      model: z.string().trim().min(1).max(200),
      mode: z.enum(['read-only', 'project-write']),
      text: z.string().trim().min(1).max(32768),
    })
    .strict(),

  'workspaces.list': projectScope,
  'workspaces.create': projectScope,
  'workspaces.review': workspaceScope,
  'workspaces.commit': workspaceScope
    .extend({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      message: z.string().trim().min(1).max(1000),
    })
    .strict(),
  'workspaces.merge': workspaceScope.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  'workspaces.remove': workspaceScope
    .extend({ token: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),

  'tasks.list': projectScope,

  'project.context.list': projectScope,
  'project.context.save': contextInput,
  'project.context.remove': projectScope.extend({ id: z.uuid() }).strict(),
} as const
export const extensionResults = {
  'skills.discover': z.array(skillInfo).max(32),
  'skills.read': skillInfo.omit({ enabled: true, changed: true }),
  'skills.select': z.object({ saved: z.boolean() }).strict(),

  'mcp.servers': z.array(mcpServer).max(10),
  'mcp.save': mcpServer,
  'mcp.remove': z.object({ removed: z.boolean() }).strict(),
  'mcp.connect': z
    .object({
      state: z.enum(['checked', 'failed']),
      message: z.string().max(500),
      tools: z.array(mcpTool).max(20),
    })
    .strict(),
  'mcp.credentials.set': z.object({ saved: z.boolean() }).strict(),
  'mcp.credentials.clear': z.object({ removed: z.boolean() }).strict(),

  'tasks.start': chatTurnSchema,
  'tasks.open': z.object({ projectId: z.uuid(), sessionId: z.uuid() }).strict(),
  'workspaces.list': z.array(managedWorkspace).max(100),
  'workspaces.create': managedWorkspace,
  'workspaces.review': workspaceReview,
  'workspaces.commit': workspaceOutcome,
  'workspaces.merge': workspaceOutcome,
  'workspaces.remove': workspaceOutcome,

  'tasks.list': z.array(taskSummary).max(100),
  'project.context.list': z.array(contextRecord).max(50),
  'project.context.save': contextRecord,
  'project.context.remove': z.object({ removed: z.boolean() }).strict(),
} as const
