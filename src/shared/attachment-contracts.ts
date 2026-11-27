import { z } from 'zod'
export const attachmentRef = z
  .object({ blobId: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
export const attachmentInfo = z
  .object({
    id: z.uuid(),
    name: z.string().max(255),
    mime: z.enum(['text/plain', 'image/png', 'image/jpeg', 'image/webp']),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(2 * 1024 * 1024),
    digest: z.string().length(64),
  })
  .strict()
export type AttachmentInfo = z.infer<typeof attachmentInfo>
export type AttachmentRef = z.infer<typeof attachmentRef>
export const attachmentArguments = {
  'attachments.import': z
    .object({ projectId: z.uuid().nullable(), sessionId: z.uuid().nullable() })
    .strict()
    .refine((a) => !a.sessionId || !!a.projectId),
} as const
export const attachmentResults = {
  'attachments.import': z
    .object({ projectId: z.uuid(), sessionId: z.uuid(), attachment: attachmentInfo })
    .strict()
    .nullable(),
} as const
