import { chatTurnSchema } from './chat-contracts'
import { z } from 'zod'
export const backupSummarySchema = z
  .object({
    version: z.number().int(),
    createdAt: z.number().int(),
    projects: z.number().int(),
    sessions: z.number().int(),
    blobs: z.number().int(),
    bytes: z.number().int(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const recoveryScope = z
  .object({ projectId: z.uuid(), sessionId: z.uuid(), turnId: z.uuid() })
  .strict()
export const recoveryReportSchema = z
  .object({
    turnId: z.uuid(),
    token: z.uuid(),
    observedAt: z.number().int(),
    providerId: z.uuid().nullable(),
    model: z.string().max(200),
    canContinue: z.boolean(),
    mode: z.enum(['chat', 'read-only']),
    checks: z
      .array(
        z
          .object({
            kind: z.enum(['history', 'approvals', 'files', 'processes', 'model']),
            state: z.enum(['verified', 'changed', 'unknown', 'unavailable']),
            detail: z.string().max(500),
          })
          .strict(),
      )
      .length(5),
    files: z
      .array(
        z
          .object({
            path: z.string().max(1000),
            hash: z.string().nullable(),
            state: z.enum(['matched', 'changed', 'unavailable']),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export type RecoveryReport = z.infer<typeof recoveryReportSchema>
export const stabilityArguments = {
  'storage.reopen': z.object({}).strict(),
  'chat.recovery.inspect': recoveryScope,
  'chat.recovery.continue': recoveryScope.extend({ token: z.uuid(), newTurnId: z.uuid() }).strict(),
  'storage.status': z.object({}).strict(),
  'storage.backup': z.object({}).strict(),
  'storage.restore.inspect': z.object({}).strict(),
  'storage.restore.stage': z
    .object({ previewId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
  'storage.restore.cancel': z.object({}).strict(),
} as const
export const stabilityResults = {
  'storage.reopen': z.object({ reopened: z.boolean() }).strict(),
  'chat.recovery.inspect': recoveryReportSchema,
  'chat.recovery.continue': chatTurnSchema,
  'storage.status': z
    .object({ version: z.number().int(), pendingRestore: z.boolean(), recoveryError: z.boolean() })
    .strict(),
  'storage.backup': backupSummarySchema.nullable(),
  'storage.restore.inspect': z
    .object({ previewId: z.uuid(), summary: backupSummarySchema })
    .strict()
    .nullable(),
  'storage.restore.stage': z.object({ staged: z.boolean(), restartRequired: z.boolean() }).strict(),
  'storage.restore.cancel': z.object({ removed: z.boolean() }).strict(),
} as const
