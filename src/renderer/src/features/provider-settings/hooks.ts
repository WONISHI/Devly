import { desktop } from '@/platform/desktop'
import { useWorkspace } from '@/store'
import type { Settings } from '@shared/data-contracts'
import type { Provider } from '@shared/data-contracts'
import type { ProbeKind, ProbeSnapshot } from '@shared/provider-contracts'
import { useEffect, useRef, useState } from 'react'
import { providerInputSchema } from '@shared/data-contracts'
export async function savePreferences(projectId: string | null, settings: Settings): Promise<void> {
  await desktop.data('settings.save', { projectId, settings })
  await useWorkspace.getState().refresh()
}
export async function changeCredential(providerId: string, clear = false): Promise<void> {
  if (clear) await desktop.data('credentials.clear', { providerId })
  else await desktop.data('credentials.set', { providerId })
  await useWorkspace.getState().refresh()
}

export async function exportPreferences(projectId: string | null): Promise<void> {
  await desktop.data('settings.export', { projectId })
}

export async function saveProvider(value: unknown): Promise<Provider> {
  const parsed = providerInputSchema.safeParse(value)
  if (!parsed.success)
    throw new Error('请检查名称和 Base URL：仅支持 HTTP(S)，不能包含账号、查询参数或片段。')
  const provider = await desktop.data('providers.save', parsed.data)
  await useWorkspace.getState().refresh()
  return provider
}
export async function removeProvider(providerId: string): Promise<void> {
  await desktop.data('providers.remove', { providerId })
  await useWorkspace.getState().refresh()
}
export function useProviderProbe(providerId: string | undefined) {
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (current.current)
        void desktop.data('providers.probe.release', { runId: current.current }).catch(() => {})
      current.current = null
    },
    [providerId],
  )
  async function start(kind: ProbeKind | 'all', timeoutMs: number) {
    if (!providerId || busy) return
    if (current.current)
      await desktop.data('providers.probe.release', { runId: current.current }).catch(() => {})
    const runId = crypto.randomUUID()
    current.current = runId
    setBusy(true)
    setError(null)
    setSnapshot(null)
    try {
      await desktop.data('providers.probe.start', { providerId, runId, kind, timeoutMs })
      async function poll() {
        if (current.current !== runId) return
        try {
          const result = await desktop.data('providers.probe.read', { runId })
          if (current.current !== runId) return
          setSnapshot(result)
          if (result.state === 'running') timer.current = setTimeout(() => void poll(), 200)
          else {
            setBusy(false)
            await useWorkspace.getState().refresh()
          }
        } catch (error) {
          if (current.current === runId) {
            setError(error instanceof Error ? error.message : '检查失败')
            setBusy(false)
          }
        }
      }
      await poll()
    } catch (error) {
      if (current.current === runId) {
        setError(error instanceof Error ? error.message : '检查失败')
        setBusy(false)
      }
    }
  }
  async function cancel() {
    if (current.current) await desktop.data('providers.probe.cancel', { runId: current.current })
  }
  return { snapshot, busy, error, start, cancel }
}
