import { captureGitBaseline } from '../agent/git-baseline'
import type { DatabaseClient } from '../data/client'
import type { CredentialVault } from '../data/vault'
import type { Provider, Session, Settings, RecentProject } from '../../shared/data-contracts'
import type { AgentInfo, AgentLimits } from '../../shared/agent-contracts'
import { defaultAgentLimits } from '../../shared/agent-contracts'
import { ReadOnlyToolbox, ToolFailure } from '../agent/tools'
import { assembleContext } from '../agent/context'
import { runAgent } from '../agent/runner'
import { ContractError, failure } from '../../shared/contracts'
import { isGenerating, type ChatTurn, type ChatError } from '../../shared/chat-contracts'
import type { Message, Usage, Completion } from '../../shared/provider-contracts'
import { ChatCompletionsAdapter } from '../providers/chat-completions'
import { ProviderError, providerError } from '../providers/errors'
import { SecretRedactor } from './redactor'
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { sep } from 'node:path'
import { ApprovalBroker } from '../agent/approval-broker'
import { ExecutionTools, executionTools } from '../agent/execution-tools'
import { executeProjectCommand } from '../agent/command-executor'

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
  private approvals = new ApprovalBroker()
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
    this.approvals.close()
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
      mode?: 'chat' | 'read-only' | 'project-write'
      selectedPaths?: string[]
    }
    if (operation === 'chat.read') return this.database.execute(operation, args)
    if (operation === 'chat.approve') {
      await this.database.execute('sessions.get', {
        projectId: args.projectId,
        sessionId: args.sessionId,
      })
      const run = this.runs.get(args.sessionId)
      if (
        !active() ||
        !run ||
        run.turnId !== args.turnId ||
        run.projectId !== args.projectId ||
        run.controller.signal.aborted
      )
        return { removed: false }
      const response = raw as Scope & {
        turnId: string
        callId: string
        approvalId: string
        digest: string
        allowed: boolean
      }
      return {
        removed: this.approvals.respond(
          {
            projectId: args.projectId,
            sessionId: args.sessionId,
            turnId: args.turnId,
            callId: response.callId,
          },
          response.approvalId,
          response.digest,
          response.allowed,
        ),
      }
    }
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
        compact: args.mode === 'read-only' || args.mode === 'project-write',
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
      if (args.mode === 'read-only' || args.mode === 'project-write') {
        if (
          args.mode === 'project-write' &&
          (settings.projectPermission !== 'ask' || process.platform !== 'darwin')
        )
          throw new ContractError(failure('FORBIDDEN'))
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
          if (args.mode === 'project-write') {
            const home = await realpath(homedir())
            if (
              home === toolbox.root ||
              home.startsWith(toolbox.root + sep) ||
              /\/(?:\.ssh|\.aws|\.codex|Library)(?:\/|$)/i.test(toolbox.root)
            )
              throw new ToolFailure('PATH_DENIED')
            // Verify the actual OS boundary before exposing mutation tools. No unsandboxed fallback.
            const probe = await executeProjectCommand(
              toolbox.root,
              { command: 'printf devly-isolation-ready', timeoutMs: 3000 },
              run.controller.signal,
            )
            if (probe.state !== 'completed' || probe.stdout !== 'devly-isolation-ready')
              throw new ToolFailure('ISOLATION_UNAVAILABLE')
          }
          const assembled = await assembleContext(
            toolbox,
            history,
            args.text,
            args.selectedPaths ?? [],
            limits,
            secret,
          )
          assembled.info.git = {
            before: await captureGitBaseline(project.path, run.controller.signal).catch(() => ({
              root: null,
              head: null,
              entries: [],
              fingerprint: '',
              available: false,
            })),
            after: null,
          }
          messages = assembled.messages
          if (args.mode === 'project-write') {
            assembled.info.mode = 'project-write'
            messages[0] = {
              role: 'system',
              content: String(messages[0].content)
                .replace('a read-only coding agent', 'a project coding agent')
                .replace(
                  'Tools available: list_files, read_file, search_text. You cannot write files, execute commands, access other directories or use the network.',
                  'Tools available: list_files, read_file, search_text, update_plan, apply_patch, run_command. Use update_plan for task steps; completed steps require successful tool call references from this turn. Every project mutation requires user approval for the exact proposal. Read files before editing and use their contentHash as expectedHash. Run only bounded foreground validation commands. Never detach processes. No extra-directory or network access is authorized. Denial and conflicts must be respected. Never repeat a mutation just because a previous run was cancelled or interrupted; inspect the current files first.',
                )
                .replace(
                  'Never claim edits or tests have been executed.',
                  'Only claim edits or tests when their tool result confirms them.',
                ),
            }
          }
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
      if (agent) {
        const execution =
          agent.info.mode === 'project-write'
            ? new ExecutionTools(
                this.database,
                this.approvals,
                agent.toolbox,
                { projectId: run.projectId, sessionId: run.sessionId, turnId: run.turnId },
                signal,
                secret,
                async () => {
                  const settings = await this.database.execute<Settings>('settings.get', {
                    projectId: run.projectId,
                  })
                  return settings.projectPermission === 'ask' && !signal.aborted
                },
              )
            : null
        result = await runAgent({
          database: this.database,
          adapter,
          toolbox: agent.toolbox,
          turn,
          messages,
          info: agent.info,
          limits: agent.limits,
          maxTokens,
          contextWindow: adapter.capabilities.contextWindow,
          secret,
          signal,
          ...(execution
            ? { tools: executionTools, executeTool: execution.execute.bind(execution) }
            : {}),
          onText: append,
          onUsage: (next) => {
            usage = next
          },
        })
      } else {
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
        cause instanceof ToolFailure && cause.code === 'EXECUTION_STATE_UNKNOWN'
          ? {
              code: 'EXECUTION_STATE_UNKNOWN',
              message:
                '执行器未能确认全部文件结果，已有修改可能保留；请核对项目后再发起新任务，未自动重试。',
              status: null,
              retryAfterSeconds: null,
            }
          : cause instanceof ContractError
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
      state =
        error.code === 'EXECUTION_STATE_UNKNOWN'
          ? 'failed'
          : normalized.info.code === 'CANCELLED'
            ? 'cancelled'
            : 'failed'
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
