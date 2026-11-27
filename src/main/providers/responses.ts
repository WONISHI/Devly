import { z } from 'zod'
import type {
  Compatibility,
  Completion,
  CompletionInput,
  ProviderAdapter,
  ProviderStreamEvent,
  ToolCall,
} from '../../shared/provider-contracts'
import { Transport, parseWire } from './transport'
import { ProviderError } from './errors'
import { calls, checkInput, identifier, natural, unknownUsage } from './native-common'
const textItem = z.object({
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z
    .array(
      z.union([
        z.object({ type: z.literal('output_text'), text: z.string() }),
        z.object({ type: z.literal('refusal'), refusal: z.string() }),
      ]),
    )
    .max(128),
})
const functionItem = z
  .object({
    type: z.literal('function_call'),
    id: identifier,
    call_id: identifier,
    name: identifier,
    arguments: z.string().max(262144),
  })
  .passthrough()
const reasoningItem = z
  .object({
    type: z.literal('reasoning'),
    id: identifier,
    encrypted_content: z.string().nullable().optional(),
    summary: z.array(z.unknown()).max(128).optional(),
  })
  .passthrough()
const item = z.union([textItem, functionItem, reasoningItem])
const wire = z.object({
  status: z.enum(['completed', 'incomplete', 'failed', 'cancelled', 'in_progress']),
  output: z.array(item).max(128),
  usage: z
    .object({ input_tokens: natural, output_tokens: natural, total_tokens: natural })
    .nullable()
    .optional(),
  incomplete_details: z.object({ reason: z.string() }).nullable().optional(),
})
export class ResponsesAdapter implements ProviderAdapter {
  private transport: Transport
  private continuation = new Map<string, unknown[]>()
  constructor(
    baseUrl: string,
    key: string,
    private compatibility: Compatibility,
    fetcher: typeof fetch = fetch,
  ) {
    this.transport = new Transport(baseUrl, key, false, fetcher)
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
      structuredOutput: this.compatibility.structuredOutput,
      contextWindow: this.compatibility.contextWindow,
    }
  }
  private payload(input: CompletionInput, stream: boolean) {
    checkInput(input, this.compatibility, true)
    const messages: unknown[] = []
    for (const message of input.messages) {
      if (message.role === 'tool')
        messages.push({
          type: 'function_call_output',
          call_id: message.toolCallId,
          output: message.content,
        })
      else if (message.role === 'assistant' && message.toolCalls?.length) {
        const cached = this.continuation.get(JSON.stringify(message.toolCalls.map((c) => c.id)))
        if (cached) messages.push(...cached)
        else {
          if (message.content)
            messages.push({
              role: 'assistant',
              content: [{ type: 'output_text', text: message.content }],
            })
          messages.push(
            ...message.toolCalls.map((c) => ({
              type: 'function_call',
              call_id: c.id,
              name: c.name,
              arguments: c.arguments,
            })),
          )
        }
      } else
        messages.push({
          role: message.role,
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map((part) =>
                  part.type === 'text'
                    ? { type: 'input_text', text: part.text }
                    : { type: 'input_image', image_url: part.url },
                ),
        })
    }
    return {
      model: input.model,
      input: messages,
      stream,
      store: false,
      include: ['reasoning.encrypted_content'],
      ...(this.compatibility.tokenParameter === 'omit'
        ? {}
        : { max_output_tokens: input.maxTokens ?? 2048 }),
      ...(this.compatibility.temperature === null
        ? {}
        : { temperature: this.compatibility.temperature }),
      ...(input.tools?.length
        ? {
            tools: input.tools.map((tool) => ({ type: 'function', ...tool, strict: false })),
            tool_choice: input.toolChoice ?? 'auto',
          }
        : {}),
      ...(input.structuredOutput
        ? { text: { format: { type: 'json_schema', ...input.structuredOutput, strict: true } } }
        : {}),
    }
  }
  private normalize(raw: unknown): Completion {
    const result = parseWire(wire, raw)
    if (result.status === 'failed') throw new ProviderError('SERVER_ERROR')
    if (result.status === 'cancelled') throw new ProviderError('CANCELLED')
    if (result.status !== 'completed' && result.status !== 'incomplete')
      throw new ProviderError('DISCONNECTED')
    const toolCalls: ToolCall[] = [],
      content: string[] = []
    let refused = false
    for (const entry of result.output) {
      if (entry.type === 'function_call')
        toolCalls.push({ id: entry.call_id, name: entry.name, arguments: entry.arguments })
      else if (entry.type === 'message')
        for (const part of entry.content) {
          if (part.type === 'output_text') content.push(part.text)
          else refused = true
        }
    }
    const finish: Completion['finish'] = refused
      ? 'filtered'
      : result.status === 'incomplete'
        ? result.incomplete_details?.reason === 'max_output_tokens'
          ? 'length'
          : 'filtered'
        : toolCalls.length
          ? 'tools'
          : 'stop'
    // Truncated calls cannot execute even if a syntactically valid JSON prefix was received.
    calls(toolCalls, finish)
    if (toolCalls.length)
      this.continuation.set(
        JSON.stringify(toolCalls.map((c) => c.id)),
        parseWire(z.object({ output: z.array(z.unknown()) }), raw).output,
      )
    if (this.continuation.size > 32) throw new ProviderError('LIMIT')
    return {
      text: content.join(''),
      toolCalls,
      finish,
      usage: result.usage
        ? {
            inputTokens: result.usage.input_tokens,
            outputTokens: result.usage.output_tokens,
            totalTokens: result.usage.total_tokens,
          }
        : unknownUsage(),
    }
  }
  async complete(input: CompletionInput, signal: AbortSignal) {
    return this.normalize(
      await this.transport.json('responses', signal, this.payload(input, false)),
    )
  }
  async models(signal: AbortSignal) {
    const value = parseWire(
      z.object({ data: z.array(z.object({ id: identifier })).max(10000) }),
      await this.transport.json('models', signal),
    )
    return [...new Set(value.data.map((m) => m.id))].slice(0, 1000)
  }
  async *stream(input: CompletionInput, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent> {
    let text = '',
      seq = -1
    const pieces = new Map<number, ToolCall>(),
      ids = new Map<number, string>(),
      toolIndices = new Map<number, number>()
    for await (const raw of this.transport.events('responses', signal, this.payload(input, true))) {
      const event = parseWire(
        z.object({ type: z.string(), sequence_number: natural.optional() }).passthrough(),
        raw,
      )
      if (event.sequence_number !== undefined) {
        if (event.sequence_number <= seq) throw new ProviderError('INVALID_RESPONSE')
        seq = event.sequence_number
      }
      if (event.type === 'error' || event.type === 'response.failed')
        throw new ProviderError('SERVER_ERROR')
      if (event.type === 'response.output_text.delta') {
        const delta = parseWire(z.object({ delta: z.string() }), event).delta
        text += delta
        if (text.length > 262144) throw new ProviderError('LIMIT')
        yield { type: 'text', delta }
      } else if (event.type === 'response.output_item.added') {
        const added = parseWire(
          z.object({
            output_index: natural.max(127),
            item: z.object({ type: z.string() }).passthrough(),
          }),
          event,
        )
        if (added.item.type === 'function_call') {
          const entry = parseWire(functionItem, added.item)
          if (pieces.has(added.output_index)) throw new ProviderError('INVALID_RESPONSE')
          const tool = { id: entry.call_id, name: entry.name, arguments: entry.arguments }
          pieces.set(added.output_index, tool)
          ids.set(added.output_index, entry.id)
          const index = toolIndices.size
          toolIndices.set(added.output_index, index)
          yield { type: 'tool', index, ...tool }
        } else if (!['message', 'reasoning'].includes(added.item.type))
          throw new ProviderError('UNSUPPORTED')
      } else if (event.type === 'response.function_call_arguments.delta') {
        const delta = parseWire(
            z.object({ output_index: natural, item_id: identifier, delta: z.string() }),
            event,
          ),
          tool = pieces.get(delta.output_index)
        if (!tool || ids.get(delta.output_index) !== delta.item_id)
          throw new ProviderError('INVALID_RESPONSE')
        tool.arguments += delta.delta
        if (tool.arguments.length > 262144) throw new ProviderError('LIMIT')
        yield { type: 'tool', index: toolIndices.get(delta.output_index)!, arguments: delta.delta }
      } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        const result = this.normalize(event.response)
        if (!result.text.startsWith(text)) throw new ProviderError('INVALID_RESPONSE')
        if (result.text.length > text.length)
          yield { type: 'text', delta: result.text.slice(text.length) }
        for (const [index, tool] of [...pieces.values()].entries()) {
          const full = result.toolCalls.find((c) => c.id === tool.id)
          if (
            !full ||
            result.toolCalls[index]?.id !== tool.id ||
            full.name !== tool.name ||
            full.arguments !== tool.arguments
          )
            throw new ProviderError('INVALID_RESPONSE')
        }
        for (let index = pieces.size; index < result.toolCalls.length; index++)
          yield { type: 'tool', index, ...result.toolCalls[index] }
        // Output-only completed events are valid, but never execute a partial earlier call.
        yield { type: 'usage', usage: result.usage }
        yield { type: 'finish', result }
        return
      }
    }
    throw new ProviderError('DISCONNECTED')
  }
}
