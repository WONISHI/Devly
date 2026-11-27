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
import { Transport, parseWire, parseJson } from './transport'
import { ProviderError } from './errors'
import { calls, checkInput, identifier, natural, unknownUsage } from './native-common'
const block = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool_use'),
    id: identifier,
    name: identifier,
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal('thinking'), thinking: z.string(), signature: z.string() }),
  z.object({ type: z.literal('redacted_thinking'), data: z.string() }),
])
const usageWire = z.object({
  input_tokens: natural.optional(),
  output_tokens: natural.optional(),
  cache_read_input_tokens: natural.optional(),
  cache_creation_input_tokens: natural.optional(),
})
const wire = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(block).max(128),
  stop_reason: z.string().nullable(),
  usage: usageWire.optional(),
})
const reason = (value: string | null): Completion['finish'] =>
  value === 'tool_use'
    ? 'tools'
    : value === 'end_turn' || value === 'stop_sequence'
      ? 'stop'
      : value === 'max_tokens'
        ? 'length'
        : value === 'refusal'
          ? 'filtered'
          : 'unknown'
function normalizedUsage(value: z.infer<typeof usageWire>): Usage {
  const input =
      value.input_tokens == null
        ? null
        : value.input_tokens +
          (value.cache_read_input_tokens ?? 0) +
          (value.cache_creation_input_tokens ?? 0),
    output = value.output_tokens ?? null
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input === null || output === null ? null : input + output,
  }
}
export class AnthropicMessagesAdapter implements ProviderAdapter {
  private transport: Transport
  private continuation = new Map<string, unknown[]>()
  constructor(
    baseUrl: string,
    key: string,
    private compatibility: Compatibility,
    fetcher: typeof fetch = fetch,
  ) {
    this.transport = new Transport(baseUrl, key, true, fetcher)
  }
  dispose() {
    this.transport.dispose()
    this.continuation.clear()
  }
  get capabilities(): ProviderAdapter['capabilities'] {
    return {
      text: 'unknown',
      streaming: 'unknown',
      tools: this.compatibility.tools === 'disabled' ? 'unsupported' : 'unknown',
      vision: this.compatibility.vision,
      structuredOutput: 'unsupported',
      contextWindow: this.compatibility.contextWindow,
    }
  }
  private payload(input: CompletionInput, stream: boolean) {
    checkInput(input, this.compatibility, false)
    if (this.compatibility.tokenParameter === 'omit') throw new ProviderError('UNSUPPORTED')
    const system: string[] = [],
      messages: { role: 'assistant' | 'user'; content: unknown[] }[] = []
    const append = (role: 'assistant' | 'user', content: unknown[]) => {
      const last = messages.at(-1)
      if (last?.role === role) last.content.push(...content)
      else messages.push({ role, content })
    }
    for (const message of input.messages) {
      if (message.role === 'system') {
        system.push(message.content)
        continue
      }
      if (message.role === 'tool') {
        append('user', [
          { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content },
        ])
        continue
      }
      if (message.role === 'assistant') {
        const cached = message.toolCalls?.length
          ? this.continuation.get(JSON.stringify(message.toolCalls.map((c) => c.id)))
          : null
        append(
          'assistant',
          cached ?? [
            ...(message.content ? [{ type: 'text', text: message.content }] : []),
            ...(message.toolCalls ?? []).map((c) => ({
              type: 'tool_use',
              id: c.id,
              name: c.name,
              input: parseJson(c.arguments),
            })),
          ],
        )
      } else
        append(
          'user',
          typeof message.content === 'string'
            ? [{ type: 'text', text: message.content }]
            : message.content.map((part) =>
                part.type === 'text'
                  ? { type: 'text', text: part.text }
                  : {
                      type: 'image',
                      source: part.url.startsWith('data:image/')
                        ? (() => {
                            const match =
                              /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
                                part.url,
                              )
                            if (!match) throw new ProviderError('BAD_REQUEST')
                            return { type: 'base64', media_type: match[1], data: match[2] }
                          })()
                        : { type: 'url', url: part.url },
                    },
              ),
        )
    }
    return {
      model: input.model,
      messages,
      stream,
      max_tokens: input.maxTokens ?? 2048,
      ...(system.length ? { system: system.join('\n\n') } : {}),
      ...(this.compatibility.temperature === null
        ? {}
        : { temperature: this.compatibility.temperature }),
      ...(input.tools?.length
        ? {
            tools: input.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
            tool_choice: { type: input.toolChoice === 'required' ? 'any' : 'auto' },
          }
        : {}),
    }
  }
  private normalize(raw: unknown): Completion {
    const value = parseWire(wire, raw),
      toolCalls = value.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, arguments: JSON.stringify(b.input) })),
      finish = reason(value.stop_reason)
    calls(toolCalls, finish)
    if (toolCalls.length)
      this.continuation.set(
        JSON.stringify(toolCalls.map((c) => c.id)),
        parseWire(z.object({ content: z.array(z.unknown()) }), raw).content,
      )
    if (this.continuation.size > 32) throw new ProviderError('LIMIT')
    return {
      text: value.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join(''),
      toolCalls,
      finish,
      usage: value.usage ? normalizedUsage(value.usage) : unknownUsage(),
    }
  }
  async complete(input: CompletionInput, signal: AbortSignal) {
    return this.normalize(await this.transport.json('messages', signal, this.payload(input, false)))
  }
  async models(signal: AbortSignal) {
    const value = parseWire(
      z.object({ data: z.array(z.object({ id: identifier })).max(10000) }),
      await this.transport.json('models', signal),
    )
    return [...new Set(value.data.map((m) => m.id))].slice(0, 1000)
  }
  async *stream(input: CompletionInput, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent> {
    let started = false,
      ended = false,
      text = '',
      finish: Completion['finish'] = 'unknown',
      usage: z.infer<typeof usageWire> = {}
    const blocks = new Map<
        number,
        {
          kind: string
          tool?: ToolCall
          closed: boolean
          json: boolean
          native: Record<string, unknown>
        }
      >(),
      toolIndices = new Map<number, number>()
    for await (const raw of this.transport.events('messages', signal, this.payload(input, true))) {
      const event = parseWire(z.object({ type: z.string() }).passthrough(), raw)
      if (event.type === 'error') {
        const type = parseWire(z.object({ error: z.object({ type: z.string() }) }), event).error
          .type
        throw new ProviderError(
          type === 'rate_limit_error'
            ? 'RATE_LIMITED'
            : type === 'authentication_error'
              ? 'AUTHENTICATION'
              : type === 'permission_error'
                ? 'ACCESS_DENIED'
                : 'SERVER_ERROR',
        )
      }
      if (event.type === 'ping') continue
      if (event.type === 'message_start') {
        if (started) throw new ProviderError('INVALID_RESPONSE')
        const message = parseWire(
          z.object({
            message: z.object({
              type: z.literal('message'),
              role: z.literal('assistant'),
              usage: usageWire,
            }),
          }),
          event,
        ).message
        usage = message.usage
        started = true
        continue
      }
      if (!started) throw new ProviderError('INVALID_RESPONSE')
      if (event.type === 'content_block_start') {
        const e = parseWire(
          z.object({
            index: natural.max(127),
            content_block: z.object({ type: z.string() }).passthrough(),
          }),
          event,
        )
        if (ended || blocks.has(e.index)) throw new ProviderError('INVALID_RESPONSE')
        if (!['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(e.content_block.type))
          throw new ProviderError('UNSUPPORTED')
        const value = {
          kind: e.content_block.type,
          closed: false,
          json: false,
          native: { ...e.content_block },
        } as {
          kind: string
          closed: boolean
          json: boolean
          tool?: ToolCall
          native: Record<string, unknown>
        }
        blocks.set(e.index, value)
        if (value.kind === 'tool_use') {
          const tool = parseWire(
            z.object({
              id: identifier,
              name: identifier,
              input: z.record(z.string(), z.unknown()),
            }),
            e.content_block,
          )
          value.tool = {
            id: tool.id,
            name: tool.name,
            arguments: Object.keys(tool.input).length ? JSON.stringify(tool.input) : '',
          }
          const index = toolIndices.size
          toolIndices.set(e.index, index)
          yield { type: 'tool', index, ...value.tool }
        } else if (value.kind === 'text') {
          const initial = parseWire(z.object({ text: z.string() }), e.content_block).text
          text += initial
          if (initial) yield { type: 'text', delta: initial }
        }
      } else if (event.type === 'content_block_delta') {
        const e = parseWire(
            z.object({ index: natural, delta: z.object({ type: z.string() }).passthrough() }),
            event,
          ),
          value = blocks.get(e.index)
        if (!value || value.closed || ended) throw new ProviderError('INVALID_RESPONSE')
        if (e.delta.type === 'text_delta' && value.kind === 'text') {
          const delta = parseWire(z.object({ text: z.string() }), e.delta).text
          text += delta
          value.native.text = String(value.native.text ?? '') + delta
          yield { type: 'text', delta }
        } else if (e.delta.type === 'input_json_delta' && value.tool) {
          const delta = parseWire(z.object({ partial_json: z.string() }), e.delta).partial_json
          value.tool.arguments += delta
          value.json = true
          yield { type: 'tool', index: toolIndices.get(e.index)!, arguments: delta }
        } else if (e.delta.type === 'thinking_delta' && value.kind === 'thinking')
          value.native.thinking =
            String(value.native.thinking ?? '') +
            parseWire(z.object({ thinking: z.string() }), e.delta).thinking
        else if (e.delta.type === 'signature_delta' && value.kind === 'thinking')
          value.native.signature =
            String(value.native.signature ?? '') +
            parseWire(z.object({ signature: z.string() }), e.delta).signature
        else throw new ProviderError('UNSUPPORTED')
        if (text.length > 262144 || (value.tool?.arguments.length ?? 0) > 262144)
          throw new ProviderError('LIMIT')
      } else if (event.type === 'content_block_stop') {
        const index = parseWire(z.object({ index: natural }), event).index,
          value = blocks.get(index)
        if (!value || value.closed) throw new ProviderError('INVALID_RESPONSE')
        value.closed = true
        if (value.tool) {
          if (!value.tool.arguments) {
            value.tool.arguments = '{}'
            yield { type: 'tool', index: toolIndices.get(index)!, arguments: '{}' }
          }
          value.native.input = parseJson(value.tool.arguments)
        }
      } else if (event.type === 'message_delta') {
        const value = parseWire(
          z.object({ delta: z.object({ stop_reason: z.string().nullable() }), usage: usageWire }),
          event,
        )
        if (ended) throw new ProviderError('INVALID_RESPONSE')
        finish = reason(value.delta.stop_reason)
        usage = { ...usage, ...value.usage }
        ended = true
      } else if (event.type === 'message_stop') {
        if (!ended || [...blocks.values()].some((b) => !b.closed))
          throw new ProviderError('DISCONNECTED')
        const ordered = [...blocks.entries()].sort(([a], [b]) => a - b),
          toolCalls = calls(
            ordered.flatMap(([, b]) => (b.tool ? [b.tool] : [])),
            finish,
          )
        if (toolCalls.length)
          this.continuation.set(
            JSON.stringify(toolCalls.map((c) => c.id)),
            ordered.map(([, b]) => b.native),
          )
        if (this.continuation.size > 32) throw new ProviderError('LIMIT')
        const result = { text, toolCalls, finish, usage: normalizedUsage(usage) }
        yield { type: 'usage', usage: result.usage }
        yield { type: 'finish', result }
        return
      }
    }
    throw new ProviderError('DISCONNECTED')
  }
}
