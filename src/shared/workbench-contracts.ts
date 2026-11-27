import { z } from 'zod'
import { changeSchema } from './editor-contracts'
const project = z.object({ projectId: z.uuid() }).strict()
const hash = z.string().regex(/^[a-f0-9]{40,64}$/)
export const gitCommitSchema = z
  .object({
    hash,
    author: z.string(),
    email: z.string(),
    timestamp: z.number().int(),
    subject: z.string(),
  })
  .strict()
export type GitCommit = z.infer<typeof gitCommitSchema>
export const gitSnapshotSchema = z
  .object({
    available: z.boolean(),
    writable: z.boolean(),
    reason: z.enum(['ready', 'non_git', 'unavailable', 'subdirectory', 'unsupported']),
    head: hash.nullable(),
    branch: z.string().nullable(),
    branches: z.array(z.string()).max(1000),
    changes: z.array(changeSchema).max(1000),
    staged: z.array(z.string()).max(1000),
    token: z.string(),
    author: z.string(),
    email: z.string(),
    conflicts: z.boolean(),
    truncated: z.boolean(),
  })
  .strict()
export type GitSnapshot = z.infer<typeof gitSnapshotSchema>
const gitResult = z
  .object({
    ok: z.boolean(),
    code: z.enum(['ok', 'stale', 'dirty', 'conflict', 'denied', 'failed', 'unavailable']),
    message: z.string(),
    hash: hash.nullable(),
  })
  .strict()
const path = z.string().min(1).max(1000)
const branch = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !value.startsWith('-') &&
      !Array.from(value).some(
        (character) => character.charCodeAt(0) <= 32 || '~^:?*[\\'.includes(character),
      ),
  )
export const terminalInfoSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    cwd: z.string(),
    state: z.enum(['running', 'exited', 'closing', 'unknown']),
    exitCode: z.number().int().nullable(),
    cols: z.number().int(),
    rows: z.number().int(),
  })
  .strict()
export type TerminalInfo = z.infer<typeof terminalInfoSchema>
export const layoutSchema = z
  .object({
    version: z.literal(1),
    sidebar: z.number().min(180).max(360),
    editor: z.number().min(32).max(72),
    tree: z.number().min(12).max(55),
    terminal: z.number().min(18).max(65),
    showTerminal: z.boolean(),
    showEditor: z.boolean(),
  })
  .strict()
export type DesktopLayout = z.infer<typeof layoutSchema>
export const defaultLayout: DesktopLayout = {
  version: 1,
  sidebar: 232,
  editor: 60,
  tree: 28,
  terminal: 32,
  showTerminal: false,
  showEditor: false,
}
const term = project.extend({ terminalId: z.uuid() }).strict()
export const workbenchArguments = {
  'git.snapshot': project,
  'git.history': project.extend({ before: hash.nullable().default(null) }).strict(),
  'git.details': project.extend({ hash }).strict(),
  'git.stage': project
    .extend({
      paths: z.array(path).min(1).max(100),
      staged: z.boolean(),
      token: z.string().max(64),
    })
    .strict(),
  'git.commit': project
    .extend({
      token: z.string().max(64),
      message: z.string().trim().min(1).max(4000),
      author: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((v) => !/[\r\n<>]/.test(v)),
      email: z.email().max(200),
    })
    .strict(),
  'git.branch': project
    .extend({
      token: z.string().max(64),
      action: z.enum(['create', 'switch', 'delete']),
      name: branch,
    })
    .strict(),
  'terminal.list': project,
  'terminal.create': project
    .extend({
      cols: z.number().int().min(20).max(500).default(80),
      rows: z.number().int().min(5).max(200).default(24),
    })
    .strict(),
  'terminal.read': term.extend({ after: z.number().int().min(0).default(0) }).strict(),
  'terminal.write': term.extend({ text: z.string().max(8192) }).strict(),
  'terminal.resize': term
    .extend({ cols: z.number().int().min(20).max(500), rows: z.number().int().min(5).max(200) })
    .strict(),
  'terminal.close': term,
  'layout.get': z.object({ projectId: z.uuid().nullable() }).strict(),
  'layout.save': z.object({ projectId: z.uuid().nullable(), layout: layoutSchema }).strict(),
} as const
export const workbenchResults = {
  'git.snapshot': gitSnapshotSchema,
  'git.history': z
    .object({
      commits: z.array(gitCommitSchema).max(30),
      next: hash.nullable(),
      available: z.boolean(),
    })
    .strict(),
  'git.details': z
    .object({
      commit: gitCommitSchema,
      files: z
        .array(
          z
            .object({
              path,
              oldPath: path.nullable(),
              status: z.enum(['added', 'modified', 'deleted', 'renamed']),
              additions: z.number().int().nullable(),
              deletions: z.number().int().nullable(),
            })
            .strict(),
        )
        .max(1000),
      truncated: z.boolean(),
    })
    .strict(),
  'git.stage': gitResult,
  'git.commit': gitResult,
  'git.branch': gitResult,
  'terminal.list': z.array(terminalInfoSchema).max(8),
  'terminal.create': terminalInfoSchema,
  'terminal.read': z
    .object({
      info: terminalInfoSchema,
      text: z.string().max(262144),
      cursor: z.number().int(),
      truncated: z.boolean(),
    })
    .strict(),
  'terminal.write': z.object({ accepted: z.boolean() }).strict(),
  'terminal.resize': terminalInfoSchema,
  'terminal.close': terminalInfoSchema,
  'layout.get': layoutSchema,
  'layout.save': layoutSchema,
} as const
