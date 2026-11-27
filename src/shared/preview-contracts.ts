import { z } from 'zod'
const scope = z.object({ projectId: z.uuid() }).strict()
export const previewState = z
  .object({
    projectId: z.uuid(),
    url: z.string().max(4096),
    entry: z.string().max(1000),
    startedAt: z.number().int(),
    kind: z.literal('static-isolated'),
  })
  .strict()
export const previewArguments = {
  'preview.start': scope.extend({ entry: z.string().trim().min(1).max(1000) }).strict(),
  'preview.status': scope,
  'preview.stop': scope,
} as const
export const previewResults = {
  'preview.start': previewState,
  'preview.status': previewState.nullable(),
  'preview.stop': z.object({ removed: z.boolean() }).strict(),
} as const
