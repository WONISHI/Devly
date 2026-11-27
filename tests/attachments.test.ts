import { it, expect, vi } from 'vitest'
import { attachmentFormat } from '../src/main/attachments/format'
import { contextBytes } from '../src/main/attachments/service'
import { ChatCompletionsAdapter } from '../src/main/providers/chat-completions'
import { ResponsesAdapter } from '../src/main/providers/responses'
import { AnthropicMessagesAdapter } from '../src/main/providers/anthropic-messages'
import { defaultCompatibility, type Message } from '../src/shared/provider-contracts'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
)
it('validates actual attachment bytes, UTF-8, image dimensions and hard size/secret bounds', () => {
  expect(attachmentFormat('说明.md', Buffer.from('真实文本')).mime).toBe('text/plain')
  expect(attachmentFormat('one.png', png).mime).toBe('image/png')
  for (const [name, bytes] of [
    ['bad.png', Buffer.from('not an image')],
    ['bad.txt', Buffer.from([255, 0])],
    ['key.txt', Buffer.from('sk-fixture-never-upload-1234567')],
    ['.env', Buffer.from('a=b')],
    ['large.txt', Buffer.alloc(128 * 1024 + 1, 65)],
    ['pdf.pdf', Buffer.from('%PDF')],
  ] as const)
    expect(() => attachmentFormat(name, bytes)).toThrow()
  const bomb = Buffer.from(png)
  bomb.writeUInt32BE(100000, 16)
  expect(() => attachmentFormat('large.png', bomb)).toThrow('ATTACHMENT_IMAGE_DIMENSIONS')
})
it('counts image context as explicitly estimated placeholders rather than treating base64 as measured tokens', () => {
  const value = [
    {
      role: 'user',
      content: [{ type: 'image', url: 'data:image/png;base64,' + 'A'.repeat(1000000) }],
    },
  ]
  expect(contextBytes(value)).toBeLessThan(5000)
  expect(contextBytes(value)).toBeGreaterThan(4000)
})
it('maps actual embedded images independently to Chat, Responses and Anthropic base64 blocks, rejecting unknown vision before HTTP', async () => {
  const url = `data:image/png;base64,${png.toString('base64')}`,
    messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'inspect' },
          { type: 'image', url },
        ],
      },
    ]
  for (const protocol of ['chat', 'responses', 'anthropic']) {
    const body =
      protocol === 'chat'
        ? { choices: [{ index: 0, finish_reason: 'stop', message: { content: 'observed' } }] }
        : protocol === 'responses'
          ? {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'observed' }],
                },
              ],
            }
          : {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'observed' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 1, output_tokens: 1 },
            }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      )
    const make = (vision: 'supported' | 'unknown') =>
      protocol === 'chat'
        ? new ChatCompletionsAdapter(
            'https://example.invalid',
            '',
            { ...defaultCompatibility, vision },
            fetcher,
          )
        : protocol === 'responses'
          ? new ResponsesAdapter(
              'https://example.invalid',
              '',
              { ...defaultCompatibility, vision },
              fetcher,
            )
          : new AnthropicMessagesAdapter(
              'https://example.invalid',
              '',
              { ...defaultCompatibility, vision },
              fetcher,
            )
    const unknown = make('unknown')
    await expect(
      unknown.complete({ model: 'fixture', messages }, new AbortController().signal),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    unknown.dispose()
    const adapter = make('supported')
    await adapter.complete({ model: 'fixture', messages }, new AbortController().signal)
    const actual = JSON.parse(String(fetcher.mock.calls[0][1]!.body))
    if (protocol === 'chat')
      expect(actual.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url } })
    if (protocol === 'responses')
      expect(actual.input[0].content[1]).toEqual({ type: 'input_image', image_url: url })
    if (protocol === 'anthropic')
      expect(actual.messages[0].content[1]).toEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') },
      })
    adapter.dispose()
  }
})
