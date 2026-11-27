import { z } from 'zod'
const scope = z.object({ projectId: z.uuid() }).strict()
export function publicAddressV4(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false
  const [a, b, c, d] = value.split('.').map(Number)
  if ([a, b, c, d].some((v) => v > 255)) return false
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  )
}
export const browserOrigin = z
  .url()
  .max(1000)
  .refine((value) => {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname === '/' &&
      (!u.port || u.port === '443') &&
      !u.hostname.includes(':') &&
      u.hostname !== 'localhost' &&
      !u.hostname.endsWith('.local') &&
      (!/^[\d.]+$/.test(u.hostname) || publicAddressV4(u.hostname))
    )
  })
  .transform((value) => new URL(value).origin)
export const serviceUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const u = new URL(value)
    return (
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1'))
    )
  })
export const webInput = scope
  .extend({
    fetchEnabled: z.boolean().default(false),
    searchEnabled: z.boolean().default(false),
    searchProtocol: z.enum(['brave', 'json']).default('brave'),
    searchUrl: serviceUrl.default('https://api.search.brave.com/res/v1/web/search'),
    browserEnabled: z.boolean().default(false),
    browserOrigins: z.array(browserOrigin).max(8).default([]),
  })
  .strict()
export const webConfig = webInput
  .extend({ revision: z.number().int().nonnegative(), hasCredential: z.boolean() })
  .strict()
export type WebConfig = z.infer<typeof webConfig>
export const searchRequest = z
  .object({
    query: z.string().trim().min(1).max(600),
    count: z.number().int().min(1).max(10).default(5),
  })
  .strict()
export const fetchRequest = z.object({ url: z.url().max(2048) }).strict()
export const webSource = z
  .object({
    title: z.string().max(300),
    url: z.url().max(2048),
    excerpt: z.string().max(12000),
    retrievedAt: z.number().int(),
  })
  .strict()
export const webResult = z
  .object({
    sources: z.array(webSource).max(10),
    truncated: z.boolean(),
    query: z.string().max(600).nullable(),
    transferred: z.string().max(1000),
  })
  .strict()
export const webArguments = {
  'web.get': scope,
  'web.save': webInput,
  'web.credentials.set': scope,
  'web.credentials.clear': scope,
  'web.test': scope.extend({ query: z.string().trim().min(1).max(600) }).strict(),
} as const
export const webResults = {
  'web.get': webConfig,
  'web.save': webConfig,
  'web.credentials.set': z.object({ saved: z.boolean() }).strict(),
  'web.credentials.clear': z.object({ removed: z.boolean() }).strict(),
  'web.test': webResult,
} as const
