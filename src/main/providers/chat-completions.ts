import { z } from 'zod'
import type {
  Compatibility,
  Completion,
  CompletionInput,
  ProviderAdapter,
  ProviderStreamEvent,
  ToolCall,
  Usage,
} from '../../shared/provider-contracts'
import { ProviderError, httpError, providerError } from './errors'

const usageWire = z
  .object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  })
  .nullable()
  .optional()
const toolWire = z.object({
  id: z.string().min(1).max(200),
  type: z.literal('function'),
  function: z.object({ name: z.string().min(1).max(200), arguments: z.string().max(262144) }),
})
const finishWire = z.string().nullable()
const resultWire = z.object({
  choices: z
    .array(
      z.object({
        index: z.literal(0),
        finish_reason: finishWire,
        message: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolWire).max(64).optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .length(1),
  usage: usageWire,
})
const chunkWire = z.object({
  choices: z
    .array(
      z.object({
        index: z.literal(0),
        // Ark omits this on intermediate chunks; only a terminal string ends a choice.
        finish_reason: finishWire.optional(),
        delta: z.object({
          content: z.string().nullable().optional(),
          tool_calls: z
            .array(
              z.object({
                index: z.number().int().min(0).max(63),
                id: z.string().max(200).optional(),
                type: z.literal('function').optional(),
                function: z
                  .object({
                    name: z.string().max(200).optional(),
                    arguments: z.string().optional(),
                  })
                  .optional(),
              }),
            )
            .max(64)
            .optional(),
        }),
      }),
    )
    .max(1),
  usage: usageWire,
})
const unknownUsage = (): Usage => ({ inputTokens: null, outputTokens: null, totalTokens: null })
function usage(value: z.infer<typeof usageWire>): Usage {
  return {
    inputTokens: value?.prompt_tokens ?? null,
    outputTokens: value?.completion_tokens ?? null,
    totalTokens: value?.total_tokens ?? null,
  }
}
function finish(value: string | null): Completion['finish'] {
  return value === 'stop'
    ? 'stop'
    : value === 'tool_calls'
      ? 'tools'
      : value === 'length'
        ? 'length'
        : value === 'content_filter'
          ? 'filtered'
          : 'unknown'
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ProviderError('INVALID_RESPONSE')
  return parsed.data
}
function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('INVALID_RESPONSE')
  }
}
function validateCalls(calls: ToolCall[], reason: Completion['finish']): ToolCall[] {
  if (new Set(calls.map((call) => call.id)).size !== calls.length)
    throw new ProviderError('INVALID_RESPONSE')
  if (calls.length && reason !== 'tools') throw new ProviderError('INVALID_RESPONSE')
  for (const call of calls) {
    if (!call.id || !call.name || !/^[\w-]{1,200}$/.test(call.name))
      throw new ProviderError('INVALID_RESPONSE')
    const value = json(call.arguments)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ProviderError('INVALID_RESPONSE')
  }
  return calls
}
async function* bodyText(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new ProviderError('INVALID_RESPONSE')
  const reader = response.body.getReader(),
    decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (signal.aborted) throw providerError(null, signal)
      if (part.done) break
      size += part.value.byteLength
      if (size > 2 * 1024 * 1024) throw new ProviderError('LIMIT')
      yield decoder.decode(part.value, { stream: true })
    }
    yield decoder.decode()
  } catch (error) {
    if (error instanceof ProviderError || signal.aborted) throw providerError(error, signal)
    throw new ProviderError('DISCONNECTED')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
async function* sse(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  let buffer = '',
    lines: string[] = []
  for await (const chunk of bodyText(response, signal)) {
    buffer += chunk
    let match: RegExpExecArray | null
    while ((match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
      const line = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      if (line === '') {
        if (lines.length) yield lines.join('\n')
        lines = []
      } else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''))
      if (lines.reduce((sum, line) => sum + line.length, 0) > 262144)
        throw new ProviderError('LIMIT')
    }
    if (buffer.length > 262144) throw new ProviderError('LIMIT')
  }
  // A partial SSE frame is never treated as a complete tool call.
  if (buffer.trim() || lines.length) throw new ProviderError('DISCONNECTED')
}

export class ChatCompletionsAdapter implements ProviderAdapter {
  get capabilities(): ProviderAdapter['capabilities'] {
    return {
      text: 'unknown',
      streaming: 'unknown',
      tools: this.compatibility.tools === 'disabled' ? 'unsupported' : 'unknown',
      vision: this.compatibility.vision,
      structuredOutput: this.compatibility.structuredOutput,
      contextWindow: this.compatibility.contextWindow,
    }
  }
  constructor(
    private baseUrl: string,
    private key: string,
    private compatibility: Compatibility,
    private fetcher: typeof fetch = fetch,
  ) {}
  dispose(): void {
    this.key = ''
  }
  private async request(path: string, signal: AbortSignal, body?: unknown): Promise<Response> {
    if (signal.aborted) throw providerError(null, signal)
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal,
        headers: {
          ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Accept: 'application/json, text/event-stream',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw httpError(response)
      }
      return response
    } catch (error) {
      throw providerError(error, signal)
    }
  }
  private payload(input: CompletionInput, stream: boolean): Record<string, unknown> {
    if (!input.model.trim() || input.messages.length === 0) throw new ProviderError('BAD_REQUEST')
    if (
      (input.tools?.length ||
        input.messages.some(
          (m) => m.role === 'tool' || (m.role === 'assistant' && m.toolCalls?.length),
        )) &&
      this.compatibility.tools === 'disabled'
    )
      throw new ProviderError('UNSUPPORTED')
    if (input.toolChoice && !input.tools?.length) throw new ProviderError('BAD_REQUEST')
    if (input.structuredOutput && this.compatibility.structuredOutput !== 'supported')
      throw new ProviderError('UNSUPPORTED')
    if (
      input.messages.some(
        (m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'image'),
      ) &&
      this.compatibility.vision !== 'supported'
    )
      throw new ProviderError('UNSUPPORTED')
    const messages = input.messages.map((message) => {
      if (message.role === 'tool')
        return { role: 'tool', content: message.content, tool_call_id: message.toolCallId }
      if (message.role === 'assistant')
        return {
          role: message.role,
          content: message.content || null,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: call.arguments },
                })),
              }
            : {}),
        }
      return {
        role: message.role,
        content: Array.isArray(message.content)
          ? message.content.map((part) =>
              part.type === 'image' ? { type: 'image_url', image_url: { url: part.url } } : part,
            )
          : message.content,
      }
    })
    return {
      model: input.model,
      messages,
      stream,
      ...(stream && this.compatibility.streamUsage
        ? { stream_options: { include_usage: true } }
        : {}),
      ...(this.compatibility.tokenParameter !== 'omit'
        ? { [this.compatibility.tokenParameter]: input.maxTokens ?? 128 }
        : {}),
      ...(this.compatibility.temperature === null
        ? {}
        : { temperature: this.compatibility.temperature }),
      ...(input.tools?.length
        ? {
            tools: input.tools.map((tool) => ({ type: 'function', function: tool })),
            tool_choice: input.toolChoice ?? 'auto',
          }
        : {}),
      ...(input.structuredOutput
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: { ...input.structuredOutput, strict: true },
            },
          }
        : {}),
    }
  }
  async complete(input: CompletionInput, signal: AbortSignal): Promise<Completion> {
    const response = await this.request('chat/completions', signal, this.payload(input, false))
    let text = ''
    for await (const chunk of bodyText(response, signal)) text += chunk
    const result = parse(resultWire, json(text)),
      choice = result.choices[0],
      reason = finish(choice.finish_reason)
    if (choice.message.refusal) throw new ProviderError('INVALID_RESPONSE')
    return {
      text: choice.message.content ?? '',
      toolCalls: validateCalls(
        (choice.message.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })),
        reason,
      ),
      usage: usage(result.usage),
      finish: reason,
    }
  }
  async models(signal: AbortSignal): Promise<string[]> {
    const response = await this.request('models', signal)
    let text = ''
    for await (const chunk of bodyText(response, signal)) text += chunk
    const result = parse(
      z.object({ data: z.array(z.object({ id: z.string().min(1).max(200) })).max(10000) }),
      json(text),
    )
    return [...new Set(result.data.map((model) => model.id))].slice(0, 1000)
  }
  async *stream(input: CompletionInput, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent> {
    const response = await this.request('chat/completions', signal, this.payload(input, true))
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel()
      throw new ProviderError('INVALID_RESPONSE')
    }
    let text = '',
      reason: Completion['finish'] = 'unknown',
      seenFinish = false,
      currentUsage = unknownUsage()
    const calls = new Map<number, ToolCall>()
    for await (const data of sse(response, signal)) {
      if (data === '[DONE]') {
        if (!seenFinish) throw new ProviderError('DISCONNECTED')
        const ordered = [...calls.entries()].sort(([a], [b]) => a - b)
        if (ordered.some(([index], position) => index !== position))
          throw new ProviderError('INVALID_RESPONSE')
        yield {
          type: 'finish',
          result: {
            text,
            toolCalls: validateCalls(
              ordered.map(([, call]) => call),
              reason,
            ),
            usage: currentUsage,
            finish: reason,
          },
        }
        return
      }
      const chunk = parse(chunkWire, json(data)),
        choice = chunk.choices[0]
      if (chunk.usage) {
        currentUsage = usage(chunk.usage)
        yield { type: 'usage', usage: currentUsage }
      }
      if (!choice) continue
      if (seenFinish) throw new ProviderError('INVALID_RESPONSE')
      if (choice.delta.content) {
        text += choice.delta.content
        yield { type: 'text', delta: choice.delta.content }
      }
      for (const part of choice.delta.tool_calls ?? []) {
        const call = calls.get(part.index) ?? { id: '', name: '', arguments: '' }
        call.id += part.id ?? ''
        call.name += part.function?.name ?? ''
        call.arguments += part.function?.arguments ?? ''
        if (call.id.length > 200 || call.name.length > 200 || call.arguments.length > 262144)
          throw new ProviderError('LIMIT')
        calls.set(part.index, call)
        yield {
          type: 'tool',
          index: part.index,
          id: part.id,
          name: part.function?.name,
          arguments: part.function?.arguments,
        }
      }
      if (choice.finish_reason != null) {
        reason = finish(choice.finish_reason)
        seenFinish = true
      }
    }
    throw new ProviderError('DISCONNECTED')
  }
}
