import { randomUUID } from 'node:crypto'
import type { AgentInfo, AgentTool, AgentLimits } from '../../shared/agent-contracts'
import type { ChatTurn } from '../../shared/chat-contracts'
import type { Message, Usage, Completion } from '../../shared/provider-contracts'
import type { ChatCompletionsAdapter } from '../providers/chat-completions'
import type { DatabaseClient } from '../data/client'
import { ProviderError } from '../providers/errors'
import { ReadOnlyToolbox, readOnlyTools, redactToolText, ToolFailure } from './tools'
import { compactToolContext } from './context'

export async function runReadOnlyAgent(options: {
  database: Pick<DatabaseClient, 'execute'>
  adapter: ChatCompletionsAdapter
  toolbox: ReadOnlyToolbox
  turn: ChatTurn
  messages: Message[]
  info: AgentInfo
  limits: AgentLimits
  maxTokens: number
  secret: string
  signal: AbortSignal
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
  const saveInfo = () => database.execute('internal.chat.agent', { ...scope, info })
  const saveTool = (tool: AgentTool) => database.execute('internal.chat.tool', { ...scope, tool })
  try {
    for (let round = 0; round < limits.maxRounds; round++) {
      toolbox.check()
      if (remainingTokens <= 0) throw new ToolFailure('TOKEN_BUDGET')
      const summary = compactToolContext(messages, limits.contextChars)
      if (summary) info.summaries.push(summary)
      if (info.summaries.length > 20) throw new ToolFailure('CONTEXT_BUDGET')
      info.rounds = round + 1
      await saveInfo()
      const parts = new Map<number, AgentTool>()
      let result: Completion | null = null
      const reserved = Math.min(remainingTokens, 2048)
      for await (const event of adapter.stream(
        { model: turn.model, messages, maxTokens: reserved, tools: readOnlyTools },
        signal,
      )) {
        toolbox.check()
        if (event.type === 'text') {
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
          if (record.input.length > 8192 || records.size > limits.maxCalls)
            throw new ToolFailure('CALL_BUDGET')
          await saveTool({
            ...record,
            callId: redactToolText(record.callId, secret),
            name: redactToolText(record.name, secret),
            input: redactToolText(record.input, secret),
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
        info.calls++
        record.state = 'running'
        await saveTool({ ...record, input: redactToolText(record.input, secret) })
        let output: Record<string, unknown>
        try {
          const data = await toolbox.execute(call.name, call.arguments)
          if (call.name === 'read_file' && typeof data.path === 'string') {
            const guidance = await toolbox.scopedGuidance(data.path)
            data.scopedInstructions = guidance
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
          output = { ok: true, data }
          record.truncated = !!data.truncated
          record.state = 'completed'
        } catch (error) {
          if (signal.aborted) throw error
          const code = error instanceof ToolFailure ? error.code : 'FILE_UNAVAILABLE'
          output = {
            ok: false,
            error: { code, message: '只读工具未完成，请检查参数、允许路径与文件类型' },
          }
          record.state = 'failed'
          record.error = code
        }
        let safe = redactToolText(JSON.stringify(output), secret)
        const originalSafe = safe
        const available = limits.maxOutputChars - usedOutput
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
    for (const record of records.values())
      if (!finalized.has(record.id)) {
        record.state = signal.aborted ? 'cancelled' : 'failed'
        record.error = signal.aborted ? 'CANCELLED' : failureCode
        await saveTool({
          ...record,
          callId: redactToolText(record.callId, secret),
          name: redactToolText(record.name, secret),
          input: redactToolText(record.input, secret),
        }).catch(() => {})
      }
  }
}
