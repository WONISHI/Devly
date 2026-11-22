import { useEffect, useState } from 'react'
import { desktop } from '@/platform/desktop'
import type { UsageSummary, AccountQuery } from '@shared/usage-contracts'

export function useProviderUsage(providerId: string) {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [account, setAccount] = useState<AccountQuery | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [querying, setQuerying] = useState(false)
  // The view is keyed by provider + revision. Cleanup blocks stale responses and cancels account HTTP.
  const [lifecycle] = useState(() => ({ active: true, querying: false }))
  useEffect(() => {
    lifecycle.active = true
    void desktop.data('usage.summary', { providerId }).then(
      (value) => {
        if (lifecycle.active) setSummary(value)
      },
      (error) => {
        if (lifecycle.active) setError(error.message)
      },
    )
    return () => {
      lifecycle.active = false
      if (lifecycle.querying)
        void desktop.data('usage.account.cancel', { providerId }).catch(() => {})
    }
  }, [providerId, lifecycle])
  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      const value = await desktop.data('usage.summary', { providerId })
      if (lifecycle.active) setSummary(value)
    } catch (error) {
      if (lifecycle.active) setError(error instanceof Error ? error.message : '刷新失败')
    } finally {
      if (lifecycle.active) setBusy(false)
    }
  }
  async function save(budgetTokens: number | null, reset = false) {
    setBusy(true)
    setError(null)
    try {
      const value = await desktop.data('usage.budget.save', { providerId, budgetTokens, reset })
      if (lifecycle.active) setSummary(value)
    } catch (error) {
      if (lifecycle.active) setError(error instanceof Error ? error.message : '保存失败')
    } finally {
      if (lifecycle.active) setBusy(false)
    }
  }
  async function queryAccount() {
    if (lifecycle.querying) return
    lifecycle.querying = true
    setQuerying(true)
    setAccount(null)
    try {
      const value = await desktop.data('usage.account', { providerId })
      if (lifecycle.active) setAccount(value)
    } catch (error) {
      if (lifecycle.active) setError(error instanceof Error ? error.message : '查询失败')
    } finally {
      lifecycle.querying = false
      if (lifecycle.active) setQuerying(false)
    }
  }
  return { summary, account, error, busy, querying, refresh, save, queryAccount }
}
