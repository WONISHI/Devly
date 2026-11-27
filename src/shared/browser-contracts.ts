import { z } from 'zod'
const selector = z.string().trim().min(1).max(200)
export const browserAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open_url'), url: z.url().max(2048) }).strict(),
  z.object({ action: z.literal('open_preview') }).strict(),
  z.object({ action: z.literal('read_text') }).strict(),
  z.object({ action: z.literal('screenshot') }).strict(),
  z.object({ action: z.literal('click'), selector }).strict(),
  z.object({ action: z.literal('fill'), selector, value: z.string().max(8192) }).strict(),
  z.object({ action: z.literal('close') }).strict(),
])
export type BrowserAction = z.infer<typeof browserAction>
