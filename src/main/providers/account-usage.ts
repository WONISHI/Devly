import { z } from 'zod'
import type { DatabaseClient } from '../data/client'
import type { CredentialVault } from '../data/vault'
import type { Provider } from '../../shared/data-contracts'
import {
  accountBalanceSchema,
  accountCapability,
  type AccountQuery,
} from '../../shared/usage-contracts'
import { ProviderError, httpError, providerError } from './errors'

type Config = Provider & { credentialRef: string | null }
const wireSchema = z.object({
  is_available: z.boolean(),
  balance_infos: z
    .array(
      z.object({
        currency: z.enum(['CNY', 'USD']),
        total_balance: z.string(),
        granted_balance: z.string(),
        topped_up_balance: z.string(),
      }),
    )
    .min(1)
    .max(10),
})

export class AccountUsageRuntime {
  private requests = new Map<string, { providerId: string; controller: AbortController }>()
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private vault: Pick<CredentialVault, 'read'>,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 10_000,
  ) {}
  clearOwner(owner: string) {
    this.requests.get(owner)?.controller.abort(new ProviderError('CANCELLED'))
  }
  clearProvider(providerId: string) {
    for (const request of this.requests.values())
      if (request.providerId === providerId)
        request.controller.abort(new ProviderError('CONFIG_CHANGED'))
  }
  cancel(owner: string, providerId: string) {
    if (this.requests.get(owner)?.providerId !== providerId) return { removed: false }
    this.clearOwner(owner)
    return { removed: true }
  }
  close() {
    for (const owner of this.requests.keys()) this.clearOwner(owner)
  }
  async query(providerId: string, owner: string, isActive: () => boolean): Promise<AccountQuery> {
    if (this.requests.has(owner) || this.requests.size >= 4)
      return { ok: false, error: new ProviderError('LIMIT').info }
    const controller = new AbortController()
    this.requests.set(owner, { providerId, controller })
    const timer = setTimeout(() => controller.abort(new ProviderError('TIMEOUT')), this.timeoutMs)
    try {
      const config = await this.database.execute<Config>('internal.provider.config', { providerId })
      if (accountCapability(config.baseUrl) !== 'deepseek') throw new ProviderError('UNSUPPORTED')
      if (!config.credentialRef) throw new ProviderError('CREDENTIAL')
      let key: string
      try {
        key = await this.vault.read(config.credentialRef)
      } catch {
        throw new ProviderError('CREDENTIAL')
      }
      try {
        if (!isActive()) controller.abort(new ProviderError('CANCELLED'))
        controller.signal.throwIfAborted()
        // This key is used only at the exact official origin configured by the user. No redirects.
        const response = await this.fetcher('https://api.deepseek.com/user/balance', {
          headers: { Authorization: `Bearer ${key}` },
          redirect: 'error',
          signal: controller.signal,
        })
        if (!response.ok) {
          await response.body?.cancel()
          throw httpError(response)
        }
        const reader = response.body?.getReader()
        if (!reader) throw new ProviderError('INVALID_RESPONSE')
        const chunks: Uint8Array[] = []
        let length = 0
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            length += value.byteLength
            if (length > 65_536) throw new ProviderError('LIMIT')
            chunks.push(value)
          }
        } finally {
          await reader.cancel().catch(() => {})
        }
        let balance
        try {
          const wire = wireSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          balance = accountBalanceSchema.parse({
            available: wire.is_available,
            checkedAt: Date.now(),
            balances: wire.balance_infos.map((item) => ({
              currency: item.currency,
              total: item.total_balance,
              granted: item.granted_balance,
              toppedUp: item.topped_up_balance,
            })),
          })
        } catch {
          throw new ProviderError('INVALID_RESPONSE')
        }
        const latest = await this.database.execute<Config>('internal.provider.config', {
          providerId,
        })
        controller.signal.throwIfAborted()
        if (!isActive()) throw new ProviderError('CANCELLED')
        if (latest.revision !== config.revision || latest.credentialRef !== config.credentialRef)
          throw new ProviderError('CONFIG_CHANGED')
        return { ok: true, balance }
      } finally {
        key = ''
      }
    } catch (error) {
      return { ok: false, error: providerError(error, controller.signal).info }
    } finally {
      clearTimeout(timer)
      this.requests.delete(owner)
    }
  }
}
