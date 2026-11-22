import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ChatCompletionsAdapter } from '../src/main/providers/chat-completions'
import { ProviderRuntime } from '../src/main/providers/runtime'
import {
  defaultCompatibility,
  type CompletionInput,
  type ProbeSnapshot,
  type ProviderReport,
  type ProviderStreamEvent,
} from '../src/shared/provider-contracts'
import { providerInputSchema, dataPayloadSchema } from '../src/shared/data-contracts'

const signal = () => new AbortController().signal
const input: CompletionInput = { model: 'test', messages: [{ role: 'user', content: 'test' }] }
const unknownUsage = { inputTokens: null, outputTokens: null, totalTokens: null }
function response(text = 'OK') {
  return Response.json({
    choices: [{ index: 0, message: { content: text }, finish_reason: 'stop' }],
  })
}
function adapter(fetcher: typeof fetch) {
  return new ChatCompletionsAdapter(
    'https://example.invalid/v1/',
    'fixture-key-never-log',
    defaultCompatibility,
    fetcher,
  )
}
const frame = (delta: unknown, finish_reason: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] })}\r\n\r\n`
function streamResponse(wire: string, byteByByte = false) {
  const bytes = new TextEncoder().encode(wire)
  return new Response(
    new ReadableStream({
      start(controller) {
        if (byteByByte) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
        else controller.enqueue(bytes)
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
async function collect(generator: AsyncGenerator<ProviderStreamEvent>) {
  const events = []
  for await (const event of generator) events.push(event)
  return events
}

describe('Chat Completions adapter', () => {
  it('normalizes nonstream text and nullable usage without vendor fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response('你好'))
    const result = await adapter(fetcher).complete(input, signal())
    expect(result).toEqual({ text: '你好', toolCalls: [], usage: unknownUsage, finish: 'stop' })
    expect(fetcher.mock.calls[0][0]).toBe('https://example.invalid/v1/chat/completions')
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error')
  })
  it('maps multiple tool calls and their results by ID, preserving required parameters', async () => {
    const calls = [0, 1].map((index) => ({
      id: `call_${index}`,
      type: 'function',
      function: { name: `tool_${index}`, arguments: `{"n":${index}}` },
    }))
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          { index: 0, message: { content: null, tool_calls: calls }, finish_reason: 'tool_calls' },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
      }),
    )
    const result = await adapter(fetcher).complete(
      {
        ...input,
        tools: [{ name: 'tool_0', description: 'test', parameters: { type: 'object' } }],
        toolChoice: 'required',
      },
      signal(),
    )
    expect(result.toolCalls.map((call) => call.name)).toEqual(['tool_0', 'tool_1'])
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 5, totalTokens: 8 })
    await adapter(fetcher).complete(
      {
        model: 'test',
        messages: [
          { role: 'assistant', content: '', toolCalls: result.toolCalls },
          ...result.toolCalls.map((call) => ({
            role: 'tool' as const,
            toolCallId: call.id,
            content: 'result',
          })),
        ],
      },
      signal(),
    )
    const payload = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
    expect(payload.messages[0].content).toBeNull()
    expect(
      payload.messages.slice(1).map((message: { tool_call_id: string }) => message.tool_call_id),
    ).toEqual(['call_0', 'call_1'])
    const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(first.tool_choice).toBe('required')
    expect(first.tools[0].function.parameters).toEqual({ type: 'object' })
  })
  it('assembles UTF8 byte fragments, interleaved tools, CRLF, comments and final usage', async () => {
    const wire =
      ': heartbeat\r\n\r\n' +
      frame({ content: '你好' }) +
      frame({
        tool_calls: [
          { index: 1, id: 'call_b', type: 'function', function: { name: 'b', arguments: '{"v":' } },
        ],
      }) +
      frame({
        tool_calls: [
          {
            index: 0,
            id: 'call_a',
            type: 'function',
            function: { name: 'a', arguments: '{"v":1}' },
          },
        ],
      }) +
      frame({ tool_calls: [{ index: 1, function: { arguments: '2}' } }] }) +
      frame({}, 'tool_calls') +
      'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":7,"total_tokens":9}}\r\n\r\ndata: [DONE]\r\n\r\n'
    const events = await collect(
      adapter(async () => streamResponse(wire, true)).stream(input, signal()),
    )
    expect(events.find((event) => event.type === 'text')).toEqual({ type: 'text', delta: '你好' })
    expect(events.at(-1)).toEqual({
      type: 'finish',
      result: {
        text: '你好',
        toolCalls: [
          { id: 'call_a', name: 'a', arguments: '{"v":1}' },
          { id: 'call_b', name: 'b', arguments: '{"v":2}' },
        ],
        usage: { inputTokens: 2, outputTokens: 7, totalTokens: 9 },
        finish: 'tools',
      },
    })
  })
  it('accepts Ark intermediate chunks without finish_reason until an explicit terminal frame', async () => {
    const intermediate = (delta: unknown) =>
      `data: ${JSON.stringify({ choices: [{ index: 0, delta }], usage: null })}\n\n`
    const wire =
      intermediate({ content: '', reasoning_content: 'fixture reasoning' }) +
      intermediate({ content: '你好', reasoning_content: '' }) +
      frame({ content: '' }, 'stop') +
      'data: [DONE]\n\n'
    const events = await collect(
      adapter(async () => streamResponse(wire, true)).stream(input, signal()),
    )
    expect(events.filter((event) => event.type === 'text')).toEqual([
      { type: 'text', delta: '你好' },
    ])
    expect(events.at(-1)).toEqual({
      type: 'finish',
      result: { text: '你好', toolCalls: [], usage: unknownUsage, finish: 'stop' },
    })
    expect(JSON.stringify(events)).not.toContain('fixture reasoning')
  })
  it('assembles tool fragments when intermediate finish_reason is omitted', async () => {
    const wire =
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"a","arguments":"{"}}]}}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}\n\n' +
      frame({}, 'tool_calls') +
      'data: [DONE]\n\n'
    const events = await collect(adapter(async () => streamResponse(wire)).stream(input, signal()))
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      result: { toolCalls: [{ id: 'call_a', name: 'a', arguments: '{}' }], finish: 'tools' },
    })
  })
  it.each([
    'data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n',
  ])('does not accept omitted finish_reason as a successful terminal state', async (wire) => {
    await expect(
      collect(adapter(async () => streamResponse(wire)).stream(input, signal())),
    ).rejects.toMatchObject({ info: { code: 'DISCONNECTED' } })
  })
  it('still rejects malformed finish reasons and content after a terminal frame', async () => {
    for (const wire of [
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":false}]}\n\n',
      frame({}, 'stop') + 'data: {"choices":[{"index":0,"delta":{"content":"late"}}]}\n\n',
    ]) {
      await expect(
        collect(adapter(async () => streamResponse(wire)).stream(input, signal())),
      ).rejects.toMatchObject({ info: { code: 'INVALID_RESPONSE' } })
    }
    await expect(
      adapter(async () =>
        Response.json({ choices: [{ index: 0, message: { content: 'unfinished' } }] }),
      ).complete(input, signal()),
    ).rejects.toMatchObject({ info: { code: 'INVALID_RESPONSE' } })
  })
  it.each([
    frame({ content: 'partial' }),
    frame({}, 'stop'),
    frame(
      { tool_calls: [{ index: 0, id: 'a', function: { name: 'a', arguments: '{"incomplete":' } }] },
      'tool_calls',
    ) + 'data: [DONE]\n\n',
  ])('rejects incomplete streams and incomplete arguments', async (wire) => {
    await expect(
      collect(adapter(async () => streamResponse(wire)).stream(input, signal())),
    ).rejects.toMatchObject({
      info: { code: wire.includes('[DONE]') ? 'INVALID_RESPONSE' : 'DISCONNECTED' },
    })
  })
  it.each([
    [401, 'AUTHENTICATION'],
    [403, 'ACCESS_DENIED'],
    [429, 'RATE_LIMITED'],
    [500, 'SERVER_ERROR'],
    [503, 'SERVER_ERROR'],
    [422, 'BAD_REQUEST'],
  ])('classifies HTTP %s without serializing the error body', async (status, code) => {
    try {
      await adapter(
        async () =>
          new Response('fixture-key-never-log', {
            status: Number(status),
            headers: { 'retry-after': '7' },
          }),
      ).complete(input, signal())
      throw new Error('expected failure')
    } catch (error) {
      expect(error).toMatchObject({ info: { code, status: Number(status), retryAfterSeconds: 7 } })
      expect(JSON.stringify(error)).not.toContain('fixture-key-never-log')
    }
  })
  it('fails a broken body stream distinctly from a connection failure', async () => {
    const broken = new Response(
      new ReadableStream({
        start(c) {
          c.error(new Error('private socket data'))
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    )
    await expect(
      collect(adapter(async () => broken).stream(input, signal())),
    ).rejects.toMatchObject({ info: { code: 'DISCONNECTED' } })
    await expect(
      adapter(async () => {
        throw new TypeError('private host key')
      }).complete(input, signal()),
    ).rejects.toMatchObject({ info: { code: 'NETWORK' } })
  })
  it('bounds response memory and rejects HTML or malformed JSON', async () => {
    await expect(
      adapter(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))).complete(input, signal()),
    ).rejects.toMatchObject({ info: { code: 'LIMIT' } })
    await expect(
      adapter(async () => new Response('<html>error</html>')).complete(input, signal()),
    ).rejects.toMatchObject({ info: { code: 'INVALID_RESPONSE' } })
  })
  it('uses explicit compatibility choices and rejects disabled capabilities before fetch', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response())
    const custom = new ChatCompletionsAdapter(
      'https://example.invalid/v1',
      '',
      { ...defaultCompatibility, tokenParameter: 'max_completion_tokens', temperature: 0.2 },
      fetcher,
    )
    await custom.complete({ ...input, maxTokens: 256 }, signal())
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      max_completion_tokens: 256,
      temperature: 0.2,
    })
    const disabled = new ChatCompletionsAdapter(
      'https://example.invalid/v1',
      '',
      { ...defaultCompatibility, tools: 'disabled' },
      fetcher,
    )
    await expect(
      disabled.complete(
        { ...input, tools: [{ name: 'x', description: 'x', parameters: {} }] },
        signal(),
      ),
    ).rejects.toMatchObject({ info: { code: 'UNSUPPORTED' } })
    await expect(
      custom.complete(
        {
          ...input,
          messages: [
            {
              role: 'user',
              content: [{ type: 'image', url: 'https://example.invalid/image.png' }],
            },
          ],
        },
        signal(),
      ),
    ).rejects.toMatchObject({ info: { code: 'UNSUPPORTED' } })
    await expect(
      custom.complete({ ...input, structuredOutput: { name: 'x', schema: {} } }, signal()),
    ).rejects.toMatchObject({ info: { code: 'UNSUPPORTED' } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reads models independently from chat support', async () => {
    expect(
      await adapter(async () =>
        Response.json({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }),
      ).models(signal()),
    ).toEqual(['b', 'a'])
    await expect(
      adapter(async () => new Response('', { status: 404 })).models(signal()),
    ).rejects.toMatchObject({ info: { code: 'BAD_REQUEST', status: 404 } })
  })
})

function fixture(fetcher: typeof fetch, credentialRef: string | null = null) {
  const config = {
    id: randomUUID(),
    name: 'fixture',
    protocol: 'chat-completions' as const,
    baseUrl: 'https://example.invalid/v1',
    model: 'fixture-model',
    compatibility: defaultCompatibility,
    hasCredential: !!credentialRef,
    credentialRef,
    revision: 1,
    report: null as ProviderReport | null,
  }
  const database = {
    async execute<T>(operation: string, args?: unknown): Promise<T> {
      if (operation === 'internal.provider.config') return structuredClone(config) as T
      if (operation === 'internal.provider.report') {
        const value = args as { revision: number; report: ProviderReport }
        if (value.revision !== config.revision) return { saved: false } as T
        config.report = structuredClone(value.report)
        return { saved: true } as T
      }
      throw new Error('unexpected operation')
    },
  }
  const runtime = new ProviderRuntime(
    database,
    { read: async () => 'fixture-key-never-log' },
    fetcher,
  )
  async function start(
    kind: 'all' | 'text' | 'tools' | 'models' | 'streaming' | 'structuredOutput',
    timeoutMs = 1000,
  ) {
    const runId = randomUUID()
    await runtime.execute(
      'providers.probe.start',
      { providerId: config.id, runId, kind, timeoutMs },
      'owner',
      () => true,
    )
    return runId
  }
  async function read(runId: string) {
    return (await runtime.execute(
      'providers.probe.read',
      { runId },
      'owner',
      () => true,
    )) as ProbeSnapshot
  }
  async function done(runId: string) {
    await vi.waitFor(async () => expect((await read(runId)).state).not.toBe('running'), {
      timeout: 3000,
      interval: 5,
    })
    return read(runId)
  }
  return { config, runtime, start, read, done }
}
describe('provider diagnostic ownership and evidence', () => {
  it('text success does not promote tools, streams or vision', async () => {
    const f = fixture(async () => response())
    const run = await f.done(await f.start('text'))
    expect(run.checks.map((check) => check.kind)).toEqual(['text'])
    expect(f.config.report?.checks).toHaveLength(1)
    expect(f.config.compatibility.vision).toBe('unknown')
  })
  it('separately proves text, streaming and a tool-result round trip', async () => {
    const bodies: Record<string, unknown>[] = []
    const f = fixture(async (_url, options) => {
      const body = JSON.parse(String(options?.body))
      bodies.push(body)
      if (body.stream)
        return streamResponse(frame({ content: 'OK' }) + frame({}, 'stop') + 'data: [DONE]\n\n')
      if (body.tools)
        return Response.json({
          choices: [
            {
              index: 0,
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'probe',
                    type: 'function',
                    function: { name: 'devly_probe', arguments: '{"nonce":"devly"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        })
      return response()
    })
    const result = await f.done(await f.start('all'))
    expect(result.state).toBe('completed')
    expect(result.checks.map((check) => [check.kind, check.ok])).toEqual([
      ['text', true],
      ['streaming', true],
      ['tools', true],
    ])
    expect(bodies[3].messages).toContainEqual({
      role: 'tool',
      content: '{"ok":true,"nonce":"devly"}',
      tool_call_id: 'probe',
    })
  })
  it('does not label a plain text response to forced tools as tools support', async () => {
    const f = fixture(async () => response())
    const result = await f.done(await f.start('tools'))
    expect(result.checks[0]).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } })
  })
  it('models 404 still permits manual model and successful chat', async () => {
    const f = fixture(async (url) =>
      String(url).endsWith('/models') ? new Response('', { status: 404 }) : response(),
    )
    expect((await f.done(await f.start('models'))).checks[0].ok).toBe(false)
    expect((await f.done(await f.start('text'))).checks[0].ok).toBe(true)
  })
  it('redacts an untrusted endpoint echo of the credential', async () => {
    const f = fixture(async () => response('fixture-key-never-log'), randomUUID())
    expect((await f.done(await f.start('text'))).preview).toBe('[REDACTED]')
    expect(JSON.stringify(f.config.report)).not.toContain('fixture-key-never-log')
  })
  it('rejects cross-owner reads/cancel and cancels on owner disposal', async () => {
    let aborted = false
    const f = fixture(
      async (_url, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(options.signal?.reason)
            },
            { once: true },
          ),
        ),
    )
    const runId = await f.start('text')
    await vi.waitFor(() => expect(f.config.revision).toBe(1))
    await expect(
      f.runtime.execute('providers.probe.cancel', { runId }, 'other', () => true),
    ).rejects.toMatchObject({ info: { code: 'FORBIDDEN' } })
    await expect(
      f.runtime.execute('providers.probe.read', { runId }, 'other', () => true),
    ).rejects.toMatchObject({ info: { code: 'FORBIDDEN' } })
    // Wait for fetch to attach the abort listener.
    await new Promise((resolve) => setTimeout(resolve, 10))
    f.runtime.clearOwner('owner')
    await vi.waitFor(() => expect(aborted).toBe(true))
    await expect(f.read(runId)).rejects.toMatchObject({ info: { code: 'NOT_FOUND' } })
    expect(f.config.report).toBeNull()
  })
  it('distinguishes timeout, explicit cancellation and configuration replacement', async () => {
    const fetcher: typeof fetch = async (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true,
        }),
      )
    const timed = fixture(fetcher)
    const timeout = await timed.done(await timed.start('text', 25))
    expect(timeout.checks[0].error?.code).toBe('TIMEOUT')
    const cancelled = fixture(fetcher),
      runId = await cancelled.start('text')
    await cancelled.runtime.execute('providers.probe.cancel', { runId }, 'owner', () => true)
    expect((await cancelled.done(runId)).state).toBe('cancelled')
    const changed = fixture(fetcher),
      changedId = await changed.start('text')
    changed.runtime.clearProvider(changed.config.id)
    expect((await changed.done(changedId)).checks[0].error?.code).toBe('CONFIG_CHANGED')
  })
  it('invalidates stale evidence even when configuration changes during the final response', async () => {
    let resolve!: (response: Response) => void
    const f = fixture(
      async () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    const runId = await f.start('text')
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    f.config.revision++
    resolve(response())
    expect((await f.done(runId)).checks[0].error?.code).toBe('CONFIG_CHANGED')
    expect(f.config.report).toBeNull()
  })
  it('rejects concurrent start races for an ID and provider', async () => {
    const f = fixture(async () => new Promise(() => {})),
      runId = randomUUID()
    const args = { providerId: f.config.id, runId, kind: 'text', timeoutMs: 30 }
    await f.runtime.execute('providers.probe.start', args, 'owner', () => true)
    await expect(
      f.runtime.execute('providers.probe.start', args, 'owner', () => true),
    ).rejects.toMatchObject({ info: { code: 'INVALID_REQUEST' } })
    await expect(
      f.runtime.execute(
        'providers.probe.start',
        { ...args, runId: randomUUID() },
        'owner',
        () => true,
      ),
    ).rejects.toMatchObject({ info: { code: 'LIMIT_EXCEEDED' } })
    f.runtime.close()
  })
})

describe('provider strict public contracts', () => {
  it('rejects secret fields, invalid compatibility choices and malformed probes', () => {
    const value = {
      name: 'test',
      protocol: 'chat-completions',
      baseUrl: 'https://example.invalid/v1',
      model: 'test',
    }
    expect(
      providerInputSchema.safeParse({ ...value, compatibility: { apiKey: 'must-not-be-accepted' } })
        .success,
    ).toBe(false)
    expect(
      providerInputSchema.safeParse({ ...value, compatibility: { temperature: 4 } }).success,
    ).toBe(false)
    expect(
      dataPayloadSchema.safeParse({
        operation: 'providers.probe.start',
        args: { providerId: randomUUID(), runId: randomUUID(), kind: 'all', timeoutMs: 0 },
      }).success,
    ).toBe(false)
  })
})
