import { z } from 'zod'
import { ProviderError, httpError, providerError } from './errors'
export async function* bodyText(response: Response, signal: AbortSignal): AsyncGenerator<string> {
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
export async function* sse(response: Response, signal: AbortSignal): AsyncGenerator<string> {
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

export function parseWire<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ProviderError('INVALID_RESPONSE')
  return result.data
}
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('INVALID_RESPONSE')
  }
}
export class Transport {
  constructor(
    private baseUrl: string,
    private key: string,
    private anthropic: boolean,
    private fetcher: typeof fetch = fetch,
  ) {}
  dispose() {
    this.key = ''
  }
  async request(path: string, signal: AbortSignal, body?: unknown) {
    if (signal.aborted) throw providerError(null, signal)
    try {
      const response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        signal,
        headers: {
          Accept: 'application/json, text/event-stream',
          ...(this.anthropic
            ? { 'anthropic-version': '2023-06-01', ...(this.key ? { 'x-api-key': this.key } : {}) }
            : this.key
              ? { Authorization: `Bearer ${this.key}` }
              : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
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
  async json(path: string, signal: AbortSignal, body?: unknown) {
    let text = ''
    for await (const part of bodyText(await this.request(path, signal, body), signal)) text += part
    return parseJson(text)
  }
  async *events(path: string, signal: AbortSignal, body: unknown): AsyncGenerator<unknown> {
    const response = await this.request(path, signal, body)
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel()
      throw new ProviderError('INVALID_RESPONSE')
    }
    for await (const frame of sse(response, signal)) yield parseJson(frame)
  }
}
