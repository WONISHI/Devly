import { describe, it, expect, vi } from 'vitest'
import { ResponsesAdapter } from '../src/main/providers/responses'
import { AnthropicMessagesAdapter } from '../src/main/providers/anthropic-messages'
import {
  defaultCompatibility,
  type ProviderAdapter,
  type ProviderStreamEvent,
  type CompletionInput,
} from '../src/shared/provider-contracts'
const input: CompletionInput = {
  model: 'fixture-model',
  messages: [
    { role: 'system', content: 'instruction' },
    { role: 'user', content: '你好' },
  ],
}
const signal = () => new AbortController().signal
const response = (output: unknown[], status = 'completed') => ({
  status,
  output,
  usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
})
const message = (content: unknown[], stop_reason = 'end_turn') => ({
  type: 'message',
  role: 'assistant',
  content,
  stop_reason,
  usage: { input_tokens: 3, output_tokens: 2 },
})
const fn = (id: string, args = '{"nonce":"devly"}') => ({
  type: 'function_call',
  id: `fc_${id}`,
  call_id: id,
  name: 'devly_probe',
  arguments: args,
})
const use = (id: string) => ({
  type: 'tool_use',
  id,
  name: 'devly_probe',
  input: { nonce: 'devly' },
})
const event = (type: string, fields: Record<string, unknown> = {}) => ({ type, ...fields })
function streaming(events: unknown[], partial = false) {
  const wire =
    events
      .map(
        (value) =>
          `event: ${(value as { type: string }).type}\r\ndata: ${JSON.stringify(value)}\r\n\r\n`,
      )
      .join('') + (partial ? 'data: {' : '')
  const bytes = new TextEncoder().encode(wire)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
async function collect(adapter: ProviderAdapter) {
  const values: ProviderStreamEvent[] = []
  for await (const event of adapter.stream(input, signal())) values.push(event)
  return values
}
for (const protocol of ['responses', 'anthropic'] as const)
  describe(protocol, () => {
    const make = (fetcher: typeof fetch): ProviderAdapter =>
      protocol === 'responses'
        ? new ResponsesAdapter(
            'https://example.invalid/v1',
            'fixture-secret',
            defaultCompatibility,
            fetcher,
          )
        : new AnthropicMessagesAdapter(
            'https://example.invalid/v1',
            'fixture-secret',
            defaultCompatibility,
            fetcher,
          )
    it('uses native nonstream messages, credentials and unknown capabilities', async () => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json(
          protocol === 'responses'
            ? response([
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: '你好' }],
                },
              ])
            : message([{ type: 'text', text: '你好' }]),
        ),
      )
      const adapter = make(fetcher),
        result = await adapter.complete(input, signal()),
        options = fetcher.mock.calls[0][1]!,
        body = JSON.parse(String(options.body)),
        headers = options.headers as Record<string, string>
      expect(result).toMatchObject({
        text: '你好',
        finish: 'stop',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      })
      expect(adapter.capabilities.text).toBe('unknown')
      expect(options.redirect).toBe('error')
      expect(fetcher.mock.calls[0][0]).toBe(
        `https://example.invalid/v1/${protocol === 'responses' ? 'responses' : 'messages'}`,
      )
      if (protocol === 'responses') {
        expect(body).toMatchObject({ store: false, input: input.messages })
        expect(headers.Authorization).toBe('Bearer fixture-secret')
        expect(body).not.toHaveProperty('messages')
      } else {
        expect(body.system).toBe('instruction')
        expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '你好' }] }])
        expect(headers['x-api-key']).toBe('fixture-secret')
        expect(headers['anthropic-version']).toBe('2023-06-01')
        expect(headers.Authorization).toBeUndefined()
      }
      adapter.dispose()
    })
    it('preserves multiple tool IDs and native result/opaque continuation blocks', async () => {
      const tools =
        protocol === 'responses'
          ? [
              { type: 'reasoning', id: 'reasoning-1', encrypted_content: 'opaque' },
              fn('a'),
              fn('b'),
            ]
          : [{ type: 'thinking', thinking: 'private', signature: 'signed' }, use('a'), use('b')]
      const fetcher = vi.fn<typeof fetch>(async () =>
          Response.json(protocol === 'responses' ? response(tools) : message(tools, 'tool_use')),
        ),
        adapter = make(fetcher),
        first = await adapter.complete(
          {
            ...input,
            tools: [
              { name: 'devly_probe', description: 'fixture', parameters: { type: 'object' } },
            ],
            toolChoice: 'required',
          },
          signal(),
        )
      expect(first.toolCalls.map((c) => c.id)).toEqual(['a', 'b'])
      await adapter.complete(
        {
          ...input,
          messages: [
            ...input.messages,
            { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
            ...first.toolCalls.map((c) => ({
              role: 'tool' as const,
              toolCallId: c.id,
              content: 'actual-result',
            })),
          ],
        },
        signal(),
      )
      const body = JSON.parse(String(fetcher.mock.calls[1][1]!.body))
      if (protocol === 'responses') {
        expect(body.input).toContainEqual(tools[0])
        expect(body.input.slice(-2)).toEqual(
          ['a', 'b'].map((call_id) => ({
            type: 'function_call_output',
            call_id,
            output: 'actual-result',
          })),
        )
      } else {
        expect(body.messages[1].content[0]).toEqual(tools[0])
        expect(body.messages[2].content).toEqual(
          ['a', 'b'].map((tool_use_id) => ({
            type: 'tool_result',
            tool_use_id,
            content: 'actual-result',
          })),
        )
      }
    })
    it('maps byte-split native text and tool streams to compact business tool indices', async () => {
      const events =
        protocol === 'responses'
          ? [
              event('response.output_item.added', { output_index: 1, item: fn('a', '') }),
              event('response.function_call_arguments.delta', {
                output_index: 1,
                item_id: 'fc_a',
                delta: '{"nonce":',
              }),
              event('response.function_call_arguments.delta', {
                output_index: 1,
                item_id: 'fc_a',
                delta: '"devly"}',
              }),
              event('response.completed', { response: response([fn('a')]) }),
            ]
          : [
              event('message_start', {
                message: {
                  type: 'message',
                  role: 'assistant',
                  usage: { input_tokens: 3, cache_read_input_tokens: 2, output_tokens: 0 },
                },
              }),
              event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
              event('content_block_delta', {
                index: 0,
                delta: { type: 'text_delta', text: '你好' },
              }),
              event('content_block_stop', { index: 0 }),
              event('content_block_start', {
                index: 1,
                content_block: { type: 'tool_use', id: 'a', name: 'devly_probe', input: {} },
              }),
              event('content_block_delta', {
                index: 1,
                delta: { type: 'input_json_delta', partial_json: '{"nonce":' },
              }),
              event('content_block_delta', {
                index: 1,
                delta: { type: 'input_json_delta', partial_json: '"devly"}' },
              }),
              event('content_block_stop', { index: 1 }),
              event('message_delta', {
                delta: { stop_reason: 'tool_use' },
                usage: { output_tokens: 2 },
              }),
              event('message_stop'),
            ]
      const values = await collect(make(vi.fn<typeof fetch>(async () => streaming(events)))),
        deltas = values.filter((v) => v.type === 'tool')
      expect(deltas.every((v) => v.index === 0)).toBe(true)
      expect(deltas.map((v) => v.arguments ?? '').join('')).toBe('{"nonce":"devly"}')
      expect(values.at(-1)).toMatchObject({
        type: 'finish',
        result: {
          toolCalls: [{ id: 'a', name: 'devly_probe', arguments: '{"nonce":"devly"}' }],
          finish: 'tools',
        },
      })
      if (protocol === 'anthropic')
        expect(values.at(-1)).toMatchObject({
          result: { text: '你好', usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 } },
        })
    })
    it('rejects partial JSON, truncated streams, duplicate calls and unsupported server tools', async () => {
      const bad =
        protocol === 'responses'
          ? response([fn('a', '{')])
          : message([{ type: 'tool_use', id: 'a', name: 'devly_probe', input: [] }], 'tool_use')
      await expect(
        make(vi.fn<typeof fetch>(async () => Response.json(bad))).complete(input, signal()),
      ).rejects.toMatchObject({ info: { code: 'INVALID_RESPONSE' } })
      const duplicate =
        protocol === 'responses'
          ? response([fn('a'), fn('a')])
          : message([use('a'), use('a')], 'tool_use')
      await expect(
        make(vi.fn<typeof fetch>(async () => Response.json(duplicate))).complete(input, signal()),
      ).rejects.toMatchObject({ info: { code: 'INVALID_RESPONSE' } })
      await expect(
        collect(make(vi.fn<typeof fetch>(async () => streaming([], true)))),
      ).rejects.toMatchObject({ info: { code: 'DISCONNECTED' } })
      const unsupported =
        protocol === 'responses'
          ? [
              event('response.output_item.added', {
                output_index: 0,
                item: { type: 'web_search_call' },
              }),
            ]
          : [
              event('message_start', {
                message: { type: 'message', role: 'assistant', usage: {} },
              }),
              event('content_block_start', {
                index: 0,
                content_block: { type: 'server_tool_use' },
              }),
            ]
      await expect(
        collect(make(vi.fn<typeof fetch>(async () => streaming(unsupported)))),
      ).rejects.toMatchObject({ info: { code: 'UNSUPPORTED' } })
    })
    it.each([
      [401, 'AUTHENTICATION'],
      [403, 'ACCESS_DENIED'],
      [429, 'RATE_LIMITED'],
      [503, 'SERVER_ERROR'],
    ] as const)('normalizes HTTP %i without leaking bodies or retrying', async (status, code) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response('fixture-secret', { status, headers: { 'retry-after': '7' } }),
      )
      await expect(make(fetcher).complete(input, signal())).rejects.toMatchObject({
        info: { code, status, retryAfterSeconds: 7 },
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
    })
    it('honors cancellation and disabled critical capabilities without making network requests', async () => {
      const fetcher = vi.fn<typeof fetch>(),
        adapter = make(fetcher),
        controller = new AbortController()
      controller.abort()
      await expect(adapter.complete(input, controller.signal)).rejects.toMatchObject({
        info: { code: 'CANCELLED' },
      })
      expect(fetcher).not.toHaveBeenCalled()
      const noTools =
        protocol === 'responses'
          ? new ResponsesAdapter(
              'https://example.invalid',
              '',
              { ...defaultCompatibility, tools: 'disabled' },
              fetcher,
            )
          : new AnthropicMessagesAdapter(
              'https://example.invalid',
              '',
              { ...defaultCompatibility, tools: 'disabled' },
              fetcher,
            )
      await expect(
        noTools.complete(
          { ...input, tools: [{ name: 'x', description: 'x', parameters: {} }] },
          signal(),
        ),
      ).rejects.toMatchObject({ info: { code: 'UNSUPPORTED' } })
      expect(fetcher).not.toHaveBeenCalled()
    })
  })
