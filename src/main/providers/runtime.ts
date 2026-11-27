import { ContractError, failure } from '../../shared/contracts'
import type { Provider } from '../../shared/data-contracts'
import {
  probeSnapshotSchema,
  type Completion,
  type ProbeKind,
  type ProbeSnapshot,
  type ProviderAdapter,
  type ProviderReport,
} from '../../shared/provider-contracts'
import type { DatabaseClient } from '../data/client'
import type { CredentialVault } from '../data/vault'
import { createAdapter } from './factory'
import { ProviderError, providerError } from './errors'

type Config = Provider & { revision: number; credentialRef: string | null }
type Run = {
  owner: string
  controller: AbortController
  snapshot: ProbeSnapshot
  revision: number
  active: () => boolean
}
type Start = { providerId: string; runId: string; kind: ProbeKind | 'all'; timeoutMs: number }
const probeTool = {
  name: 'devly_probe',
  description: 'Return the diagnostic nonce. This does not execute local tools.',
  parameters: {
    type: 'object',
    properties: { nonce: { type: 'string', enum: ['devly'] } },
    required: ['nonce'],
    additionalProperties: false,
  },
}
const probeMessages = [
  { role: 'user' as const, content: 'Connection diagnostic only. Reply with OK.' },
]

export class ProviderRuntime {
  private runs = new Map<string, Run>()
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private vault: Pick<CredentialVault, 'read'>,
    private fetcher: typeof fetch = fetch,
  ) {}
  clearOwner(owner: string): void {
    for (const [id, run] of this.runs)
      if (run.owner === owner) {
        run.controller.abort(new ProviderError('CANCELLED'))
        this.runs.delete(id)
      }
  }
  clearProvider(providerId: string): void {
    for (const run of this.runs.values())
      if (run.snapshot.providerId === providerId && run.snapshot.state === 'running')
        run.controller.abort(new ProviderError('CONFIG_CHANGED'))
  }
  close(): void {
    for (const run of this.runs.values()) run.controller.abort(new ProviderError('CANCELLED'))
    this.runs.clear()
  }
  private owned(runId: string, owner: string): Run {
    const run = this.runs.get(runId)
    if (!run) throw new ContractError(failure('NOT_FOUND'))
    if (run.owner !== owner) throw new ContractError(failure('FORBIDDEN'))
    return run
  }
  async execute(
    operation: string,
    args: Record<string, unknown>,
    owner: string,
    active: () => boolean,
  ): Promise<unknown> {
    if (operation === 'providers.probe.start') {
      const input = args as Start
      for (const [id, run] of this.runs)
        if (run.snapshot.endedAt && Date.now() - run.snapshot.endedAt > 600000) this.runs.delete(id)
      if (this.runs.has(input.runId)) throw new ContractError(failure('INVALID_REQUEST'))
      const running = [...this.runs.values()].filter((run) => run.snapshot.state === 'running')
      if (
        running.length >= 4 ||
        running.some((run) => run.snapshot.providerId === input.providerId)
      )
        throw new ContractError(failure('LIMIT_EXCEEDED'))
      if (this.runs.size >= 32) {
        const expired = [...this.runs].find(([, run]) => run.snapshot.state !== 'running')
        if (expired) this.runs.delete(expired[0])
        else throw new ContractError(failure('LIMIT_EXCEEDED'))
      }
      // Reserve synchronously before the first await: concurrent starts cannot reuse an ID.
      const run: Run = {
        owner,
        active,
        revision: 0,
        controller: new AbortController(),
        snapshot: {
          runId: input.runId,
          providerId: input.providerId,
          model: '',
          state: 'running',
          phase: input.kind === 'all' ? 'text' : input.kind,
          checks: [],
          preview: '',
          models: [],
          startedAt: Date.now(),
          endedAt: null,
        },
      }
      this.runs.set(input.runId, run)
      void this.run(run, input).catch(() => {
        run.snapshot.state = 'failed'
        run.snapshot.endedAt = Date.now()
      })
      return { runId: input.runId }
    }
    const run = this.owned(String(args.runId), owner)
    if (operation === 'providers.probe.read') return probeSnapshotSchema.parse(run.snapshot)
    if (operation === 'providers.probe.cancel' || operation === 'providers.probe.release') {
      const removed = run.snapshot.state === 'running'
      if (removed) run.controller.abort(new ProviderError('CANCELLED'))
      if (operation === 'providers.probe.release') this.runs.delete(String(args.runId))
      return { removed }
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
  private async run(run: Run, input: Start): Promise<void> {
    const { snapshot, controller } = run,
      signal = controller.signal
    const timer = setTimeout(() => controller.abort(new ProviderError('TIMEOUT')), input.timeoutMs)
    let adapter: ProviderAdapter | undefined,
      secret = '',
      config: Config | undefined
    // Diagnostic previews may contain an untrusted server echo; never return a Key echo.
    const redact = (text: string) => {
      let safe = secret ? text.split(secret).join('[REDACTED]') : text
      // A streaming fragment may end halfway through an echoed Key.
      for (let length = Math.min(secret.length - 1, safe.length); length > 0; length--) {
        if (safe.endsWith(secret.slice(0, length))) {
          safe = safe.slice(0, -length) + '…'
          break
        }
      }
      return safe.slice(0, 4096)
    }
    try {
      config = await this.database.execute<Config>('internal.provider.config', {
        providerId: input.providerId,
      })
      snapshot.model = config.model
      run.revision = config.revision
      if (!run.active()) throw new ProviderError('CANCELLED')
      if (signal.aborted) throw providerError(null, signal)
      if (
        input.kind === 'structuredOutput' &&
        config.compatibility.structuredOutput === 'unsupported'
      )
        throw new ProviderError('UNSUPPORTED')
      // Keyless local endpoints are allowed. A saved but unreadable credential fails closed.
      if (config.credentialRef) {
        try {
          secret = await this.vault.read(config.credentialRef)
        } catch {
          throw new ProviderError('CREDENTIAL')
        }
      }
      adapter = createAdapter(
        {
          ...config,
          compatibility: {
            ...config.compatibility,
            ...(input.kind === 'structuredOutput'
              ? { structuredOutput: 'supported' as const }
              : {}),
          },
        },
        secret,
        this.fetcher,
      )
      const kinds: ProbeKind[] =
        input.kind === 'all' ? ['text', 'streaming', 'tools'] : [input.kind]
      for (const kind of kinds) {
        snapshot.phase = kind
        let result: Completion | null = null
        try {
          if (signal.aborted) throw providerError(null, signal)
          if (!run.active()) throw new ProviderError('CANCELLED')
          const current = await this.database.execute<Config>('internal.provider.config', {
            providerId: input.providerId,
          })
          if (current.revision !== run.revision) throw new ProviderError('CONFIG_CHANGED')
          if (kind === 'models')
            snapshot.models = (await adapter.models(signal))
              .map((id) => redact(id).slice(0, 200))
              .filter(Boolean)
          else if (kind === 'streaming') {
            snapshot.preview = ''
            let rawPreview = '',
              sawText = false
            for await (const event of adapter.stream(
              { model: config.model, messages: probeMessages },
              signal,
            )) {
              if (event.type === 'text') {
                sawText = true
                rawPreview += event.delta
                snapshot.preview = redact(rawPreview)
              }
              if (event.type === 'finish') result = event.result
            }
            if (!sawText || !result?.text.trim() || result.finish !== 'stop')
              throw new ProviderError('INVALID_RESPONSE')
          } else if (kind === 'tools') result = await this.tools(adapter, config.model, signal)
          else {
            result = await adapter.complete(
              {
                model: config.model,
                messages:
                  kind === 'structuredOutput'
                    ? [{ role: 'user', content: 'Return JSON with ok equal to true.' }]
                    : probeMessages,
                ...(kind === 'structuredOutput'
                  ? {
                      structuredOutput: {
                        name: 'devly_check',
                        schema: {
                          type: 'object',
                          properties: { ok: { type: 'boolean' } },
                          required: ['ok'],
                          additionalProperties: false,
                        },
                      },
                    }
                  : {}),
              },
              signal,
            )
            if (!result.text.trim() || result.finish !== 'stop' || result.toolCalls.length)
              throw new ProviderError('INVALID_RESPONSE')
            if (kind === 'structuredOutput') {
              try {
                if (JSON.parse(result.text).ok !== true) throw new Error()
              } catch {
                throw new ProviderError('INVALID_RESPONSE')
              }
            }
            snapshot.preview = redact(result.text)
          }
          if (signal.aborted) throw providerError(null, signal)
          snapshot.checks.push({
            kind,
            ok: true,
            checkedAt: Date.now(),
            error: null,
            usage: result?.usage ?? null,
          })
        } catch (error) {
          snapshot.checks.push({
            kind,
            ok: false,
            checkedAt: Date.now(),
            error: providerError(error, signal).info,
            usage: null,
          })
          if (signal.aborted) break
          // Auth/server errors need no more billable requests; models-list failure is independent.
          if (snapshot.checks.at(-1)?.error?.code !== 'UNSUPPORTED' && kind !== 'models') break
        }
      }
    } catch (error) {
      const normalized =
        error instanceof ContractError
          ? new ProviderError('CONFIG_CHANGED')
          : providerError(error, signal)
      snapshot.checks.push({
        kind: snapshot.phase,
        ok: false,
        checkedAt: Date.now(),
        error: normalized.info,
        usage: null,
      })
    } finally {
      clearTimeout(timer)
      adapter?.dispose()
      secret = ''
    }
    if (config && run.active() && !signal.aborted) {
      const updated = new Set(snapshot.checks.map((check) => check.kind))
      const report: ProviderReport = {
        checks: [
          ...(config.report?.checks ?? []).filter((check) => !updated.has(check.kind)),
          ...snapshot.checks,
        ],
      }
      try {
        const { saved } = await this.database.execute<{ saved: boolean }>(
          'internal.provider.report',
          { providerId: input.providerId, revision: config.revision, report },
        )
        if (!saved) {
          snapshot.checks = [
            {
              kind: snapshot.phase,
              ok: false,
              checkedAt: Date.now(),
              error: new ProviderError('CONFIG_CHANGED').info,
              usage: null,
            },
          ]
        }
      } catch {
        snapshot.checks = [
          {
            kind: snapshot.phase,
            ok: false,
            checkedAt: Date.now(),
            error: new ProviderError('CONFIG_CHANGED').info,
            usage: null,
          },
        ]
      }
    }
    snapshot.state =
      signal.aborted &&
      signal.reason instanceof ProviderError &&
      signal.reason.info.code === 'CANCELLED'
        ? 'cancelled'
        : snapshot.checks.length && snapshot.checks.every((check) => check.ok)
          ? 'completed'
          : 'failed'
    snapshot.endedAt = Date.now()
  }
  private async tools(
    adapter: ProviderAdapter,
    model: string,
    signal: AbortSignal,
  ): Promise<Completion> {
    const request = {
      model,
      messages: [{ role: 'user' as const, content: 'Call devly_probe with nonce devly.' }],
      tools: [probeTool],
      toolChoice: 'required' as const,
    }
    const first = await adapter.complete(request, signal)
    if (
      first.finish !== 'tools' ||
      !first.toolCalls.length ||
      first.toolCalls.some(
        (call) => call.name !== probeTool.name || JSON.parse(call.arguments).nonce !== 'devly',
      )
    )
      throw new ProviderError('INVALID_RESPONSE')
    const second = await adapter.complete(
      {
        model,
        messages: [
          ...request.messages,
          { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
          ...first.toolCalls.map((call) => ({
            role: 'tool' as const,
            toolCallId: call.id,
            content: '{"ok":true,"nonce":"devly"}',
          })),
        ],
      },
      signal,
    )
    if (!second.text.trim() || second.finish !== 'stop' || second.toolCalls.length)
      throw new ProviderError('INVALID_RESPONSE')
    return {
      ...second,
      usage: {
        inputTokens:
          first.usage.inputTokens === null || second.usage.inputTokens === null
            ? null
            : first.usage.inputTokens + second.usage.inputTokens,
        outputTokens:
          first.usage.outputTokens === null || second.usage.outputTokens === null
            ? null
            : first.usage.outputTokens + second.usage.outputTokens,
        totalTokens:
          first.usage.totalTokens === null || second.usage.totalTokens === null
            ? null
            : first.usage.totalTokens + second.usage.totalTokens,
      },
    }
  }
}
