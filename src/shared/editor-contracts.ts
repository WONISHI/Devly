import { z } from 'zod'
export const editorPath = z.string().min(1).max(1000)
export const documentSchema = z
  .object({
    path: editorPath,
    status: z.enum(['text', 'missing', 'binary', 'too_large', 'encoding', 'denied', 'unavailable']),
    text: z.string().max(262144).nullable(),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    bytes: z.number().int().nonnegative().nullable(),
  })
  .strict()
export type ProjectDocument = z.infer<typeof documentSchema>
export const fileEntrySchema = z
  .object({ path: editorPath, type: z.enum(['directory', 'file']) })
  .strict()
export type FileEntry = z.infer<typeof fileEntrySchema>
export const changeSchema = z
  .object({
    path: editorPath,
    oldPath: editorPath.nullable(),
    status: z.string().length(2),
    kind: z.enum(['added', 'modified', 'deleted', 'renamed', 'unmerged', 'other']),
  })
  .strict()
export type FileChange = z.infer<typeof changeSchema>
export const changesSchema = z
  .object({
    available: z.boolean(),
    changes: z.array(changeSchema).max(1000),
    truncated: z.boolean(),
    reason: z.enum(['ready', 'non_git', 'unavailable']),
  })
  .strict()
export const diffSchema = z
  .object({
    path: editorPath,
    oldPath: editorPath.nullable(),
    original: documentSchema,
    modified: documentSchema,
    baseline: z.literal('HEAD'),
    available: z.boolean(),
  })
  .strict()
export type ProjectDiff = z.infer<typeof diffSchema>
export const editorArguments = {
  'editor.list': z
    .object({
      projectId: z.uuid(),
      path: editorPath.default('.'),
      offset: z.number().int().min(0).max(10000).default(0),
    })
    .strict(),
  'editor.read': z.object({ projectId: z.uuid(), path: editorPath }).strict(),
  'editor.save': z
    .object({
      projectId: z.uuid(),
      path: editorPath,
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      content: z.string().max(262144),
    })
    .strict(),
  'editor.observe': z
    .object({ projectId: z.uuid(), watchId: z.uuid(), paths: z.array(editorPath).max(64) })
    .strict(),
  'editor.release': z.object({ watchId: z.uuid() }).strict(),
  'editor.changes': z.object({ projectId: z.uuid() }).strict(),
  'editor.diff': z.object({ projectId: z.uuid(), path: editorPath }).strict(),
} as const
export const editorResults = {
  'editor.list': z
    .object({ entries: z.array(fileEntrySchema).max(100), nextOffset: z.number().int().nullable() })
    .strict(),
  'editor.read': documentSchema,
  'editor.save': z
    .object({
      saved: z.boolean(),
      document: documentSchema,
      recoveryPath: z.string().nullable(),
      error: z.enum(['conflict', 'unavailable', 'missing', 'denied']).nullable(),
    })
    .strict(),
  'editor.observe': z
    .object({
      revision: z.number().int().nonnegative(),
      watching: z.number().int().nonnegative(),
      degraded: z.boolean(),
    })
    .strict(),
  'editor.release': z.object({ removed: z.boolean() }).strict(),
  'editor.changes': changesSchema,
  'editor.diff': diffSchema,
} as const
