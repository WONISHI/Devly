import type { DatabaseClient } from '../data/client'
import type { CredentialVault } from '../data/vault'
import type { Provider, Session } from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { isGenerating, type ChatTurn, type ChatError } from '../../shared/chat-contracts'
import type { Message, Usage, Completion } from '../../shared/provider-contracts'
import { ChatCompletionsAdapter } from '../providers/chat-completions'
import { ProviderError, providerError } from '../providers/errors'
import { SecretRedactor } from './redactor'

type Scope = { projectId: string; sessionId: string }
type Config = Provider & { credentialRef: string | null }
type Run = Scope & {
  turnId: string
  providerId: string | null
  ready: boolean
  controller: AbortController
  done: Promise<void>
}
export class ChatRuntime {
  private runs = new Map<string, Run>()
  private closing = false
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private vault: Pick<CredentialVault, 'read'>,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 120000,
  ) {}
  initialize(): Promise<unknown> {
    return this.database.execute('internal.chat.recover', {})
  }
  clearProvider(providerId: string): void {
    for (const run of this.runs.values())
      if (run.providerId === providerId) run.controller.abort(new ProviderError('CONFIG_CHANGED'))
  }
  async cancelScope(projectId: string, sessionId?: string): Promise<void> {
    const runs = [...this.runs.values()].filter(
      (run) => run.projectId === projectId && (!sessionId || run.sessionId === sessionId),
    )
    for (const run of runs) run.controller.abort(new ProviderError('CANCELLED'))
    await Promise.all(runs.map((run) => run.done))
  }
  async close(): Promise<void> {
    this.closing = true
    const runs = [...this.runs.values()]
    for (const run of runs) run.controller.abort(new ProviderError('CANCELLED'))
    await Promise.all(runs.map((run) => run.done))
  }
  async execute(
    operation: string,
    raw: Record<string, unknown>,
    active: () => boolean,
  ): Promise<unknown> {
    const args = raw as Scope & {
      turnId: string
      text: string
      expectedProviderId: string
      expectedModel: string
    }
    if (operation === 'chat.read') return this.database.execute(operation, args)
    if (operation === 'chat.cancel') {
      await this.database.execute('sessions.get', {
        projectId: args.projectId,
        sessionId: args.sessionId,
      })
      const run = this.runs.get(args.sessionId)
      if (!run || run.turnId !== args.turnId) return { removed: false }
      if (run.projectId !== args.projectId) throw new ContractError(failure('FORBIDDEN'))
      run.controller.abort(new ProviderError('CANCELLED'))
      if (run.ready)
        await this.database.execute('internal.chat.update', { ...args, phase: 'stopping' })
      return { removed: true }
    }
    if (operation !== 'chat.start') throw new ContractError(failure('INVALID_REQUEST'))
    if (this.closing || this.runs.size >= 4) throw new ContractError(failure('LIMIT_EXCEEDED'))
    if (this.runs.has(args.sessionId)) throw new ContractError(failure('CHAT_BUSY'))
    const run: Run = {
      projectId: args.projectId,
      sessionId: args.sessionId,
      turnId: args.turnId,
      providerId: null,
      ready: false,
      controller: new AbortController(),
      done: Promise.resolve(),
    }
    this.runs.set(args.sessionId, run)
    // Reserve before the first await; also let shutdown/removal await preparation.
    let release!: () => void
    const preparing = new Promise<void>((resolve) => {
      release = resolve
    })
    run.done = preparing
    let secret = '',
      adapter: ChatCompletionsAdapter | undefined
    try {
      const session = await this.database.execute<Session>('sessions.get', {
        projectId: args.projectId,
        sessionId: args.sessionId,
      })
      if (session.archived) throw new ContractError(failure('FORBIDDEN'))
      if (!session.providerId || !session.model.trim())
        throw new ContractError(failure('BINDING_CHANGED'))
      if (session.providerId !== args.expectedProviderId || session.model !== args.expectedModel)
        throw new ContractError(failure('BINDING_CHANGED'))
      run.providerId = session.providerId
      const config = await this.database.execute<Config>('internal.provider.config', {
        providerId: session.providerId,
      })
      if (config.protocol !== 'chat-completions')
        throw new ContractError(failure('BINDING_CHANGED'))
      const history = await this.database.execute<Message[]>('internal.chat.context', args)
      const messages: Message[] = [...history, { role: 'user', content: args.text }]
      if (Buffer.byteLength(JSON.stringify(messages)) > 262144)
        throw new ContractError(failure('CONTEXT_LIMIT'))
      const settings = await this.database.execute<{ maxTokens: number }>('settings.get', {
        projectId: args.projectId,
      })
      if (config.credentialRef) {
        try {
          secret = await this.vault.read(config.credentialRef)
        } catch {
          throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
        }
      }
      if (secret && args.text.includes(secret)) throw new ContractError(failure('INVALID_REQUEST'))
      if (!active()) throw new ContractError(failure('FORBIDDEN'))
      if (run.controller.signal.aborted || this.closing)
        throw new ContractError(failure('BINDING_CHANGED'))
      const turn = await this.database.execute<ChatTurn>('internal.chat.begin', {
        ...args,
        providerId: session.providerId,
        model: session.model,
        revision: config.revision,
      })
      run.ready = true
      adapter = new ChatCompletionsAdapter(
        config.baseUrl,
        secret,
        config.compatibility,
        this.fetcher,
      )
      const task = this.generate(run, adapter, secret, messages, turn, settings.maxTokens)
      // A renderer reload does not own this lifetime; durable IDs keep all writes in the original session.
      void task
        .catch(async () => {
          await this.database
            .execute('internal.chat.update', {
              ...args,
              state: 'failed',
              phase: 'failed',
              endedAt: Date.now(),
              error: {
                code: 'STORAGE',
                message: '保存生成结果失败，请重启后核对历史',
                status: null,
                retryAfterSeconds: null,
              },
            })
            .catch(() => {})
        })
        .finally(() => {
          this.runs.delete(args.sessionId)
          release()
        })
      return turn
    } catch (error) {
      adapter?.dispose()
      this.runs.delete(args.sessionId)
      release()
      throw error
    } finally {
      secret = ''
    }
  }
  private async generate(
    run: Run,
    adapter: ChatCompletionsAdapter,
    secret: string,
    messages: Message[],
    turn: ChatTurn,
    maxTokens: number,
  ): Promise<void> {
    const signal = run.controller.signal
    const timer = setTimeout(
      () => run.controller.abort(new ProviderError('TIMEOUT')),
      this.timeoutMs,
    )
    const redactor = new SecretRedactor(secret)
    secret = ''
    let text = '',
      lastFlush = 0,
      result: Completion | null = null,
      error: ChatError | null = null
    let state: ChatTurn['state'] = 'completed',
      usage: Usage | null = null
    try {
      for await (const event of adapter.stream(
        { model: turn.model, messages, maxTokens },
        signal,
      )) {
        if (signal.aborted) throw providerError(null, signal)
        if (event.type === 'tool') throw new ProviderError('UNSUPPORTED')
        if (event.type === 'text') {
          text += redactor.push(event.delta)
          if (text.length > 262144) throw new ProviderError('LIMIT')
          if (Date.now() - lastFlush >= 80) {
            await this.database.execute('internal.chat.update', {
              projectId: run.projectId,
              sessionId: run.sessionId,
              turnId: run.turnId,
              text,
            })
            lastFlush = Date.now()
          }
        }
        if (event.type === 'usage') usage = event.usage
        if (event.type === 'finish') result = event.result
      }
      if (signal.aborted) throw providerError(null, signal)
      if (
        !result ||
        !['stop', 'length'].includes(result.finish) ||
        result.toolCalls.length ||
        !result.text.trim()
      )
        throw new ProviderError('INVALID_RESPONSE')
      usage = result.usage
    } catch (cause) {
      const normalized = providerError(cause, signal)
      error = normalized.info
      state = normalized.info.code === 'CANCELLED' ? 'cancelled' : 'failed'
    } finally {
      clearTimeout(timer)
      adapter.dispose()
      text = (text + redactor.finish()).slice(0, 262144)
    }
    if (!isGenerating(turn.state)) throw new Error('Invalid initial turn state')
    await this.database.execute('internal.chat.update', {
      projectId: run.projectId,
      sessionId: run.sessionId,
      turnId: run.turnId,
      text,
      state,
      phase: state,
      endedAt: Date.now(),
      error,
      usage,
      finish: result?.finish ?? null,
    })
  }
}
