import { z } from 'zod'
export const validationSchema = z
  .object({
    state: z.enum(['unreported', 'complete', 'incomplete', 'conflict']),
    framework: z.literal('tap').nullable(),
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    tests: z
      .array(
        z
          .object({ name: z.string().max(300), status: z.enum(['passed', 'failed', 'skipped']) })
          .strict(),
      )
      .max(100),
    truncated: z.boolean(),
  })
  .strict()
export type ValidationRecord = z.infer<typeof validationSchema>
export const commandRecordSchema = z
  .object({
    state: z.enum(['completed', 'failed', 'cancelled', 'timeout', 'output_limit', 'unknown']),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    durationMs: z.number().int().nonnegative(),
    stdout: z.string().max(4096),
    stderr: z.string().max(4096),
    previewTruncated: z.boolean(),
    trace: z.string().max(4096),
    validation: validationSchema,
  })
  .strict()
export type CommandRecord = z.infer<typeof commandRecordSchema>
