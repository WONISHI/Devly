import { z } from 'zod'
const change = z
  .object({
    path: z.string().min(1).max(1000),
    expectedHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    content: z
      .string()
      .max(262144)
      .refine((text) => Buffer.byteLength(text) <= 262144)
      .refine(
        (text) =>
          new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(Buffer.from(text)) ===
          text,
      ),
  })
  .strict()
export const patchRequest = z.object({ changes: z.array(change).min(1).max(20) }).strict()
export type PatchRequest = z.infer<typeof patchRequest>
import { applyProjectPatch as applyCore } from './patch-core'
export { contentHash } from './patch-core'
export function applyProjectPatch(root: string, input: PatchRequest, signal: AbortSignal) {
  return applyCore(root, patchRequest.parse(input), signal)
}
