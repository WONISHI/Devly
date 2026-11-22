import { z } from 'zod'
import { providerErrorSchema } from './provider-contracts'

const count = z.number().int().nonnegative()
const metric = z.object({ tokens: count, reportedTurns: count }).strict()
export const usageStatsSchema = z
  .object({ turns: count, input: metric, output: metric, total: metric })
  .strict()
export const usageSummarySchema = z
  .object({
    providerId: z.uuid(),
    lifetime: usageStatsSchema,
    period: usageStatsSchema,
    activeTurns: count,
    budgetTokens: count.max(1_000_000_000_000).nullable(),
    since: count,
    updatedAt: count,
  })
  .strict()
export type UsageStats = z.infer<typeof usageStatsSchema>
export type UsageSummary = z.infer<typeof usageSummarySchema>
export const accountBalanceSchema = z
  .object({
    available: z.boolean(),
    checkedAt: count,
    balances: z
      .array(
        z
          .object({
            currency: z.enum(['CNY', 'USD']),
            total: z.string().regex(/^-?\d{1,16}(\.\d{1,8})?$/),
            granted: z.string().regex(/^-?\d{1,16}(\.\d{1,8})?$/),
            toppedUp: z.string().regex(/^-?\d{1,16}(\.\d{1,8})?$/),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
export type AccountBalance = z.infer<typeof accountBalanceSchema>
export const accountQuerySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), balance: accountBalanceSchema }).strict(),
  z.object({ ok: z.literal(false), error: providerErrorSchema }).strict(),
])
export type AccountQuery = z.infer<typeof accountQuerySchema>

// Match the configured service, never the model's brand. An Ark DeepSeek key is not a DeepSeek key.
export function accountCapability(baseUrl: string): 'deepseek' | 'ark' | 'unsupported' {
  try {
    const url = new URL(baseUrl)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return 'unsupported'
    if (url.hostname === 'api.deepseek.com' && /^\/(v1\/?)?$/.test(url.pathname)) return 'deepseek'
    if (/^ark\.[a-z0-9-]+\.volces\.com$/.test(url.hostname)) return 'ark'
  } catch {
    /* Invalid input is rejected at the IPC boundary. */
  }
  return 'unsupported'
}

export function remainingBudget(
  summary: UsageSummary,
): { remaining: number; exceeded: number; partial: boolean } | null {
  if (summary.budgetTokens === null) return null
  return {
    remaining: Math.max(0, summary.budgetTokens - summary.period.total.tokens),
    exceeded: Math.max(0, summary.period.total.tokens - summary.budgetTokens),
    partial: summary.period.total.reportedTurns < summary.period.turns || summary.activeTurns > 0,
  }
}
