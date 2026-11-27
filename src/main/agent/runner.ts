import { contextBytes } from '../attachments/service'
import type { TaskBudget } from '../extensions/budget'
import { projectGuidance } from '../extensions/context'
import { captureGitBaseline } from './git-baseline'
import { randomUUID } from 'node:crypto'
import type { AgentInfo, AgentTool, AgentLimits } from '../../shared/agent-contracts'
import type { ChatTurn } from '../../shared/chat-contracts'
import type { Message, Usage, Completion, Tool } from '../../shared/provider-contracts'
import type { ProviderAdapter } from '../../shared/provider-contracts'
import type { DatabaseClient } from '../data/client'
import { ProviderError } from '../providers/errors'
import { ReadOnlyToolbox, readOnlyTools, redactToolText, ToolFailure } from './tools'
import { compactToolContext } from './context'
import { validatePlan } from './plan'

export async function runAgent(options: {
  database: Pick<DatabaseClient, 'execute'>
  adapter: ProviderAdapter
  toolbox: ReadOnlyToolbox
  turn: ChatTurn
  messages: Message[]
  info: AgentInfo
  limits: AgentLimits
  maxTokens: number
  budget?: TaskBudget
  secret: string
  signal: AbortSignal
  tools?: Tool[]
  contextProjectId?: string
  contextWindow?: number | null
  executeTool?: (
    name: string,
    input: string,
    record: AgentTool,
    save: (tool: AgentTool) => Promise<unknown>,
  ) => Promise<Record<string, unknown>>
  onText(delta: string): Promise<void>
  onUsage(usage: Usage): void
}): Promise<Completion> {
  const { database, adapter, toolbox, turn, messages, info, limits, secret, signal } = options
  const scope = { projectId: turn.projectId, sessionId: turn.sessionId, turnId: turn.id }
  let usedOutput = 0,
    remainingTokens = options.maxTokens
  const total: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const ids = new Set<string>()
  const records = new Map<string, AgentTool>()
  const finalized = new Set<string>()
  let failureCode = 'INCOMPLETE_CALL'
  const saveInfo = () => {
    if (info.family && options.budget) info.family.remaining = options.budget.remaining()
    return database.execute('internal.chat.agent', { ...scope, info })
  }
  const saveTool = (tool: AgentTool) => database.execute('internal.chat.tool', { ...scope, tool })
  try {
    for (let round = 0; round < limits.maxRounds; round++) {
      toolbox.check()
      if (options.budget && options.budget.remaining().durationMs < 1)
        throw new ToolFailure('TIME_BUDGET')
      if (remainingTokens <= 0) throw new ToolFailure('TOKEN_BUDGET')
      const summary = compactToolContext(messages, limits.contextChars)
      if (summary) info.summaries.push(summary)
      if (info.summaries.length > 20) throw new ToolFailure('CONTEXT_BUDGET')
      info.rounds = round + 1
      const characters = contextBytes({ messages, tools: options.tools ?? readOnlyTools })
      info.context = {
        characters,
        estimatedTokens: Math.ceil(characters / 3),
        windowTokens: options.contextWindow ?? null,
      }
      if (
        info.context.windowTokens !== null &&
        info.context.estimatedTokens + Math.min(remainingTokens, 2048) > info.context.windowTokens
      )
        throw new ToolFailure('CONTEXT_BUDGET')
      await saveInfo()
      const parts = new Map<number, AgentTool>()
      let result: Completion | null = null
      const reserved = Math.min(
        remainingTokens,
        options.budget?.remaining().tokens ?? Infinity,
        2048,
      )
      if (reserved < 1) throw new ToolFailure('TOKEN_BUDGET')
      if (info.family && options.budget)
        messages.push({
          role: 'user',
          content: `Runtime budget metadata (not a user instruction): remaining ${JSON.stringify(options.budget.remaining())}; any child reservation must fit all remaining caps.`,
        })
      compactToolContext(messages, limits.contextChars)
      for await (const event of adapter.stream(
        { model: turn.model, messages, maxTokens: reserved, tools: options.tools ?? readOnlyTools },
        signal,
      )) {
        toolbox.check()
        if (event.type === 'text') {
          options.budget?.output(event.delta.length)
          usedOutput += event.delta.length
          if (usedOutput > limits.maxOutputChars) throw new ToolFailure('OUTPUT_BUDGET')
          await options.onText(event.delta)
        }
        if (event.type === 'tool') {
          const record = parts.get(event.index) ?? {
            id: randomUUID(),
            callId: '',
            name: '',
            state: 'proposed' as const,
            approval: null,
            execution: null,
            input: '',
            output: '',
            error: null,
            truncated: false,
            blobId: null,
            position: records.size,
          }
          if (!parts.has(event.index)) {
            parts.set(event.index, record)
            records.set(record.id, record)
          }
          record.callId += event.id ?? ''
          record.name += event.name ?? ''
          record.input += event.arguments ?? ''
          if (
            record.input.length > (options.executeTool ? 262144 : 8192) ||
            records.size > limits.maxCalls
          )
            throw new ToolFailure('CALL_BUDGET')
          await saveTool({
            ...record,
            callId: '',
            name: '',
            input: '', // Do not publish incomplete secret-bearing argument fragments.
          })
        }
        if (event.type === 'finish') result = event.result
      }
      if (!result) throw new ProviderError('DISCONNECTED')
      for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
        if (result.usage[field] === null) {
          total[field] = null
        } else if (total[field] !== null) total[field]! += result.usage[field]!
      }
      remainingTokens -= result.usage.outputTokens ?? reserved
      options.budget?.tokens(result.usage.outputTokens ?? reserved)
      options.onUsage({ ...total })
      if (remainingTokens < 0) throw new ToolFailure('TOKEN_BUDGET')
      if (!result.toolCalls.length) {
        if (!['stop', 'length'].includes(result.finish) || !result.text.trim())
          throw new ProviderError('INVALID_RESPONSE')
        await saveInfo()
        return { ...result, usage: total }
      }
      if (result.finish !== 'tools') throw new ProviderError('INVALID_RESPONSE')
      if (round + 1 >= limits.maxRounds) throw new ToolFailure('ROUND_BUDGET')
      if (info.calls + result.toolCalls.length > limits.maxCalls)
        throw new ToolFailure('CALL_BUDGET')
      messages.push({
        role: 'assistant',
        content: result.text,
        toolCalls: result.toolCalls,
        ...(result.reasoning ? { reasoning: result.reasoning } : {}),
      })
      for (let index = 0; index < result.toolCalls.length; index++) {
        toolbox.check()
        const call = result.toolCalls[index]
        if (ids.has(call.id)) throw new ToolFailure('DUPLICATE_CALL_ID')
        ids.add(call.id)
        const record = parts.get(index)
        if (!record || record.callId !== call.id || record.name !== call.name)
          throw new ProviderError('INVALID_RESPONSE')
        options.budget?.call()
        info.calls++
        record.state = 'running'
        await saveTool({ ...record, input: redactToolText(record.input, secret) })
        let output: Record<string, unknown>
        try {
          if (!(options.tools ?? readOnlyTools).some((tool) => tool.name === call.name))
            throw new ToolFailure('UNKNOWN_TOOL')
          let data: Record<string, unknown>
          if (
            call.name === 'update_plan' &&
            options.tools?.some((tool) => tool.name === 'update_plan')
          ) {
            info.plan = validatePlan(call.arguments, records.values(), secret)
            data = { steps: info.plan, source: 'model-plan-with-tool-references' }
          } else
            data = options.executeTool
              ? await options.executeTool(call.name, call.arguments, record, saveTool)
              : await toolbox.execute(call.name, call.arguments)
          if (call.name === 'read_file' && typeof data.path === 'string') {
            const guidance = await toolbox.scopedGuidance(data.path)
            data.scopedInstructions = guidance
            const records = await projectGuidance(
              database,
              options.contextProjectId ?? turn.projectId,
              [data.path],
              secret,
            )
            data.userManagedProjectGuidance = records
            for (const source of records)
              if (!info.sources.some((s) => s.kind === source.kind && s.path === source.path)) {
                if (info.sources.length >= 100) throw new ToolFailure('CONTEXT_BUDGET')
                info.sources.push({
                  kind: source.kind,
                  path: source.path,
                  chars: source.text.length,
                })
              }
            for (const source of guidance)
              if (!info.sources.some((s) => s.kind === 'instruction' && s.path === source.path)) {
                if (info.sources.length >= 100) throw new ToolFailure('CONTEXT_BUDGET')
                info.sources.push({
                  kind: 'instruction',
                  path: source.path,
                  chars: source.text.length,
                })
              }
            if (guidance.some((source) => source.truncated)) data.truncated = true
          }
          const sourcePath = `${call.name}: ${String(JSON.parse(call.arguments).path ?? '.')}`
          if (
            !info.sources.some((source) => source.kind === 'tool' && source.path === sourcePath)
          ) {
            if (info.sources.length >= 100) throw new ToolFailure('CONTEXT_BUDGET')
            info.sources.push({
              kind: 'tool',
              path: sourcePath,
              chars: JSON.stringify(data).length,
            })
          }
          output = { ok: !data.failed, data }
          record.truncated = !!data.truncated
          record.state = data.failed ? 'failed' : 'completed'
          if (data.failed) record.error = 'EXECUTION_FAILED'
        } catch (error) {
          if (signal.aborted) throw error
          if (error instanceof ToolFailure && error.code === 'EXECUTION_STATE_UNKNOWN') throw error
          const code = error instanceof ToolFailure ? error.code : 'FILE_UNAVAILABLE'
          output = {
            ok: false,
            error: {
              code,
              message: code.startsWith('WEB_')
                ? '网页请求未完成：请检查网络开关、独立搜索凭据、公开 HTTPS 地址或服务限流；不会生成替代来源或自动重试。'
                : '工具未执行成功，请检查参数、审批、允许路径与文件类型',
            },
          }
          record.state = ['APPROVAL_DENIED', 'APPROVAL_EXPIRED', 'PERMISSION_DENIED'].includes(code)
            ? 'denied'
            : 'failed'
          record.error = code
        }
        let safe = redactToolText(JSON.stringify(output), secret)
        const originalSafe = safe
        const available = Math.min(
          limits.maxOutputChars - usedOutput,
          options.budget?.remaining().outputChars ?? Infinity,
        )
        if (available < 256) throw new ToolFailure('OUTPUT_BUDGET')
        if (safe.length > available) {
          safe = JSON.stringify({
            ok: false,
            truncated: true,
            error: { code: 'OUTPUT_BUDGET', message: '本回合工具输出预算不足，未返回完整结果' },
          })
          record.truncated = true
          record.state = 'failed'
          record.error = 'OUTPUT_BUDGET'
        }
        options.budget?.output(safe.length)
        usedOutput += safe.length
        const log = await database.execute<{ id: string }>('internal.agent.log', {
          ...scope,
          name: record.name,
          output: originalSafe,
        })
        record.output = safe.slice(0, 16000)
        record.blobId = log.id
        record.input = redactToolText(record.input, secret)
        record.callId = redactToolText(record.callId, secret)
        record.name = redactToolText(record.name, secret)
        await saveTool(record)
        finalized.add(record.id)
        await saveInfo()
        messages.push({ role: 'tool', toolCallId: call.id, content: safe })
      }
    }
    throw new ToolFailure('ROUND_BUDGET')
  } catch (error) {
    failureCode =
      error instanceof ToolFailure
        ? error.code
        : error instanceof ProviderError
          ? error.info.code
          : 'LOG_UNAVAILABLE'
    throw error
  } finally {
    if (info.git) {
      info.git.after = await captureGitBaseline(toolbox.root).catch(() => null)
      await saveInfo().catch(() => {})
    }
    for (const record of records.values())
      if (!finalized.has(record.id)) {
        record.state =
          failureCode === 'EXECUTION_STATE_UNKNOWN'
            ? 'failed'
            : signal.aborted
              ? 'cancelled'
              : 'failed'
        record.error =
          failureCode === 'EXECUTION_STATE_UNKNOWN'
            ? failureCode
            : signal.aborted
              ? 'CANCELLED'
              : failureCode
        if (record.approval?.state === 'pending')
          record.approval.state = signal.aborted ? 'cancelled' : 'expired'
        await saveTool({
          ...record,
          callId: redactToolText(record.callId, secret),
          name: redactToolText(record.name, secret),
          input: redactToolText(record.input, secret),
        }).catch(() => {})
      }
  }
}
