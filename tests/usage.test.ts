import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  accountCapability,
  remainingBudget,
  usageSummarySchema,
} from '../src/shared/usage-contracts'
import { dataPayloadSchema } from '../src/shared/data-contracts'
import { AccountUsageRuntime } from '../src/main/providers/account-usage'
import type { DatabaseClient } from '../src/main/data/client'

const providerId = randomUUID()
const config = { baseUrl: 'https://api.deepseek.com/v1', revision: 1, credentialRef: randomUUID() }
const wire = {
  is_available: true,
  balance_infos: [
    {
      currency: 'CNY',
      total_balance: '12.30',
      granted_balance: '2.30',
      topped_up_balance: '10.00',
    },
  ],
}
function runtime(fetcher: typeof fetch, override = {}, timeout = 1000) {
  const current = { ...config, ...override }
  const database = { execute: vi.fn(async () => structuredClone(current)) } as unknown as Pick<
    DatabaseClient,
    'execute'
  >
  const read = vi.fn(async () => 'fixture-secret')
  return { current, read, instance: new AccountUsageRuntime(database, { read }, fetcher, timeout) }
}
it.each([
  ['https://api.deepseek.com', 'deepseek'],
  ['https://api.deepseek.com/v1/', 'deepseek'],
  ['https://ark.cn-beijing.volces.com/api/v3', 'ark'],
  ['https://api.deepseek.com.evil.invalid/v1', 'unsupported'],
  ['http://api.deepseek.com/v1', 'unsupported'],
  ['https://api.deepseek.com:8443/v1', 'unsupported'],
  ['https://api.deepseek.com/proxy', 'unsupported'],
  ['https://evil.invalid/deepseek', 'unsupported'],
  ['https://api.deepseek.com/v1?key=x', 'unsupported'],
])('recognizes account service by exact configured origin: %s', (url, expected) => {
  expect(accountCapability(url)).toBe(expected)
})
it('returns only allowlisted balance fields and uses the configured official origin without redirects', async () => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ ...wire, secret: 'fixture-secret' }),
  )
  const { instance } = runtime(fetcher)
  const result = await instance.query(providerId, 'owner', () => true)
  expect(result.ok).toBe(true)
  expect(JSON.stringify(result)).not.toContain('fixture-secret')
  expect(result.ok && result.balance.balances[0].total).toBe('12.30')
  expect(fetcher.mock.calls[0][0]).toBe('https://api.deepseek.com/user/balance')
  expect(fetcher.mock.calls[0][1]?.redirect).toBe('error')
})
it('never sends an Ark or proxy key to DeepSeek', async () => {
  const fetcher = vi.fn<typeof fetch>()
  const { instance, read } = runtime(fetcher, {
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  })
  const result = await instance.query(providerId, 'owner', () => true)
  expect(!result.ok && result.error.code).toBe('UNSUPPORTED')
  expect(fetcher).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})
it.each([
  [401, 'AUTHENTICATION'],
  [403, 'ACCESS_DENIED'],
  [429, 'RATE_LIMITED'],
  [503, 'SERVER_ERROR'],
] as const)('sanitizes HTTP %s without exposing upstream bodies', async (status, expected) => {
  const { instance } = runtime(async () => new Response('fixture-secret', { status }))
  const result = await instance.query(providerId, 'owner', () => true)
  expect(!result.ok && result.error.code).toBe(expected)
  expect(JSON.stringify(result)).not.toContain('fixture-secret')
})
it('rejects malformed balance and unbounded responses', async () => {
  for (const [value, code] of [
    [
      { ...wire, balance_infos: [{ currency: 'CNY', total_balance: 'fixture-secret' }] },
      'INVALID_RESPONSE',
    ],
    ['x'.repeat(70000), 'LIMIT'],
  ] as const) {
    const { instance } = runtime(async () =>
      typeof value === 'string' ? new Response(value) : Response.json(value),
    )
    const result = await instance.query(providerId, 'owner', () => true)
    expect(!result.ok && result.error.code).toBe(code)
  }
})
it('does not publish results after configuration changes', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    current.revision++
    return Response.json(wire)
  })
  const { instance, current } = runtime(fetcher)
  const result = await instance.query(providerId, 'owner', () => true)
  expect(!result.ok && result.error.code).toBe('CONFIG_CHANGED')
})
it('does not read or send a key without a saved credential', async () => {
  const fetcher = vi.fn<typeof fetch>()
  const { instance, read } = runtime(fetcher, { credentialRef: null })
  const result = await instance.query(providerId, 'owner', () => true)
  expect(!result.ok && result.error.code).toBe('CREDENTIAL')
  expect(fetcher).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})
it('cancels by owner and provider, distinguishing timeout and configuration change', async () => {
  for (const mode of ['timeout', 'owner', 'provider'] as const) {
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    const { instance } = runtime(
      async (_url, options) => {
        started()
        return new Promise<Response>((_resolve, reject) =>
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason)),
        )
      },
      {},
      25,
    )
    const pending = instance.query(providerId, 'owner', () => true)
    await ready
    expect(instance.cancel('other', providerId).removed).toBe(false)
    if (mode === 'owner') instance.clearOwner('owner')
    if (mode === 'provider') instance.clearProvider(providerId)
    const result = await pending
    expect(!result.ok && result.error.code).toBe(
      mode === 'timeout' ? 'TIMEOUT' : mode === 'owner' ? 'CANCELLED' : 'CONFIG_CHANGED',
    )
  }
})
it('blocks duplicate account queries and suppresses inactive owners', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(wire))
  const { instance } = runtime(fetcher)
  const first = instance.query(providerId, 'owner', () => false)
  const second = await instance.query(providerId, 'owner', () => true)
  expect(!second.ok && second.error.code).toBe('LIMIT')
  const result = await first
  expect(!result.ok && result.error.code).toBe('CANCELLED')
  expect(fetcher).not.toHaveBeenCalled()
})
it('validates budget bounds at the IPC boundary', () => {
  for (const budgetTokens of [-1, 1.5, 1e13, '100'])
    expect(
      dataPayloadSchema.safeParse({
        operation: 'usage.budget.save',
        args: { providerId, budgetTokens },
      }).success,
    ).toBe(false)
  expect(
    dataPayloadSchema.safeParse({
      operation: 'usage.account',
      args: { providerId, key: 'forbidden' },
    }).success,
  ).toBe(false)
})
it('keeps unknown usage distinct from zero and clamps overspending without hiding it', () => {
  const stats = {
    turns: 2,
    input: { tokens: 10, reportedTurns: 1 },
    output: { tokens: 20, reportedTurns: 1 },
    total: { tokens: 30, reportedTurns: 1 },
  }
  const summary = usageSummarySchema.parse({
    providerId,
    lifetime: stats,
    period: stats,
    activeTurns: 0,
    budgetTokens: null,
    since: 0,
    updatedAt: 0,
  })
  expect(remainingBudget(summary)).toBe(null)
  expect(remainingBudget({ ...summary, budgetTokens: 100 })).toEqual({
    remaining: 70,
    exceeded: 0,
    partial: true,
  })
  expect(remainingBudget({ ...summary, budgetTokens: 20 })).toEqual({
    remaining: 0,
    exceeded: 10,
    partial: true,
  })
  expect(remainingBudget({ ...summary, budgetTokens: 0, period: { ...stats, turns: 1 } })).toEqual({
    remaining: 0,
    exceeded: 30,
    partial: false,
  })
})
