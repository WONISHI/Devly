import type { DatabaseClient } from '../data/client'
import type { CredentialVault } from '../data/vault'
import type { Provider, Session, Settings, RecentProject } from '../../shared/data-contracts'
import type { AgentInfo, AgentLimits } from '../../shared/agent-contracts'
import { defaultAgentLimits } from '../../shared/agent-contracts'
import { ReadOnlyToolbox, ToolFailure } from '../agent/tools'
import { assembleContext } from '../agent/context'
import { runReadOnlyAgent } from '../agent/runner'
import { ContractError, failure } from '../../shared/contracts'
import { isGenerating, type ChatTurn, type ChatError } from '../../shared/chat-contracts'
import type { Message, Usage, Completion } from '../../shared/provider-contracts'
import { ChatCompletionsAdapter } from '../providers/chat-completions'
import { ProviderError, providerError } from '../providers/errors'
import { SecretRedactor } from './redactor'
import { realpath } from 'node:fs/promises'

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
    private timeoutMs?: number,
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
      mode?: 'chat' | 'read-only'
      selectedPaths?: string[]
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
      const history = await this.database.execute<Message[]>('internal.chat.context', {
        ...args,
        compact: args.mode === 'read-only',
      })
      let messages: Message[] = [...history, { role: 'user', content: args.text }]
      if (Buffer.byteLength(JSON.stringify(messages)) > 262144)
        throw new ContractError(failure('CONTEXT_LIMIT'))
      const settings = await this.database.execute<Settings>('settings.get', {
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
      let agent: { toolbox: ReadOnlyToolbox; info: AgentInfo; limits: AgentLimits } | undefined
      if (args.mode === 'read-only') {
        if (
          config.compatibility.tools === 'disabled' ||
          config.report?.checks.find((check) => check.kind === 'tools')?.ok === false
        )
          throw new ContractError(failure('FORBIDDEN'))
        const projects = await this.database.execute<RecentProject[]>('projects.list', {})
        const project = projects.find((p) => p.id === args.projectId)
        if (!project?.available || project.managed)
          throw new ContractError(failure('PROJECT_UNAVAILABLE'))
        if ((await realpath(project.path)) !== project.path)
          throw new ContractError(failure('PROJECT_UNAVAILABLE'))
        try {
          const limits = settings.agentLimits ?? defaultAgentLimits
          const toolbox = await ReadOnlyToolbox.create(project.path, run.controller.signal, secret)
          const assembled = await assembleContext(
            toolbox,
            history,
            args.text,
            args.selectedPaths ?? [],
            limits,
            secret,
          )
          messages = assembled.messages
          agent = { toolbox, info: assembled.info, limits }
        } catch (cause) {
          throw new ContractError(
            failure(
              cause instanceof ToolFailure && cause.code === 'CONTEXT_BUDGET'
                ? 'CONTEXT_LIMIT'
                : 'INVALID_REQUEST',
            ),
          )
        }
      }
      if (!active()) throw new ContractError(failure('FORBIDDEN'))
      if (run.controller.signal.aborted || this.closing)
        throw new ContractError(failure('BINDING_CHANGED'))
      const turn = await this.database.execute<ChatTurn>('internal.chat.begin', {
        ...args,
        providerId: session.providerId,
        model: session.model,
        revision: config.revision,
        ...(agent ? { agent: agent.info } : {}),
      })
      run.ready = true
      adapter = new ChatCompletionsAdapter(
        config.baseUrl,
        secret,
        config.compatibility,
        this.fetcher,
      )
      const task = this.generate(run, adapter, secret, messages, turn, settings.maxTokens, agent)
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
    agent?: { toolbox: ReadOnlyToolbox; info: AgentInfo; limits: AgentLimits },
  ): Promise<void> {
    const signal = run.controller.signal
    const timer = setTimeout(
      () => run.controller.abort(new ProviderError('TIMEOUT')),
      agent
        ? Math.min(this.timeoutMs ?? 300000, agent.limits.maxDurationMs)
        : (this.timeoutMs ?? 120000),
    )
    const redactor = new SecretRedactor(secret)
    let text = '',
      lastFlush = 0,
      result: Completion | null = null,
      error: ChatError | null = null
    let state: ChatTurn['state'] = 'completed',
      usage: Usage | null = null
    try {
      const append = async (delta: string) => {
        text += redactor.push(delta)
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
      if (agent)
        result = await runReadOnlyAgent({
          database: this.database,
          adapter,
          toolbox: agent.toolbox,
          turn,
          messages,
          info: agent.info,
          limits: agent.limits,
          maxTokens,
          secret,
          signal,
          onText: append,
          onUsage: (next) => {
            usage = next
          },
        })
      else {
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
      error =
        cause instanceof ContractError
          ? {
              code: cause.info.code === 'LIMIT_EXCEEDED' ? 'LIMIT' : 'STORAGE',
              message:
                cause.info.code === 'LIMIT_EXCEEDED'
                  ? '本地工具日志存储达到配额，请清理后重试'
                  : '保存工具记录失败，请核对本地存储',
              status: null,
              retryAfterSeconds: null,
            }
          : cause instanceof ToolFailure && !signal.aborted
            ? {
                code: 'LIMIT',
                message: `只读 Agent 已停止：${({ CONTEXT_BUDGET: '上下文预算不足', TOKEN_BUDGET: 'Token 预算耗尽', OUTPUT_BUDGET: '输出预算耗尽', CALL_BUDGET: '工具调用次数或参数上限', ROUND_BUDGET: '模型轮数上限', DUPLICATE_CALL_ID: '工具调用 ID 重复' } as Record<string, string>)[cause.code] ?? '工具边界检查未通过'}`,
                status: null,
                retryAfterSeconds: null,
              }
            : normalized.info
      state = normalized.info.code === 'CANCELLED' ? 'cancelled' : 'failed'
    } finally {
      clearTimeout(timer)
      adapter.dispose()
      secret = ''
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
