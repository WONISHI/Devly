// Loopback fault injection; streamed tool proposals never reach execution before a valid finish.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-lifecycle-')),
  project = join(root, 'project')
await mkdir(project)
await writeFile(join(project, 'sentinel.txt'), 'unchanged')
const counts = new Map(),
  secret = 'fixture-secret-never-publish'
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const part of req) raw += part
  const body = JSON.parse(raw),
    key = `${req.url}:${body.model}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
  const fault = body.model.slice('fault-'.length)
  if (/^\d+$/.test(fault)) {
    res.writeHead(Number(fault), { 'retry-after': '1' })
    res.end(secret)
    return
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const frames = req.url.endsWith('/responses')
    ? [
        {
          type: 'response.output_item.added',
          output_index: 1,
          item: {
            type: 'function_call',
            id: 'fc-partial',
            call_id: 'partial',
            name: 'read_file',
            arguments: '',
          },
        },
        {
          type: 'response.function_call_arguments.delta',
          output_index: 1,
          item_id: 'fc-partial',
          delta: '{',
        },
      ]
    : req.url.endsWith('/messages')
      ? [
          {
            type: 'message_start',
            message: {
              type: 'message',
              role: 'assistant',
              usage: { input_tokens: 1, output_tokens: 0 },
            },
          },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'partial', name: 'read_file', input: {} },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{' },
          },
        ]
      : [
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'partial',
                      type: 'function',
                      function: { name: 'read_file', arguments: '{' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
        ]
  for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`)
  if (fault === 'disconnect') res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
let db, runtime
const checks = []
try {
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project })
  for (const protocol of ['chat-completions', 'responses', 'anthropic-messages'])
    for (const fault of [
      '401',
      '403',
      '429',
      '503',
      'disconnect',
      'timeout',
      'cancel',
      'shutdown',
    ]) {
      const model = `fault-${fault}`,
        provider = await db.execute('providers.save', {
          name: `${protocol}/${fault}`,
          protocol,
          model,
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        })
      await db.execute('internal.credential.ref', { providerId: provider.id, ref: randomUUID() })
      const session = await db.execute('sessions.create', { projectId: p.id }),
        scope = { projectId: p.id, sessionId: session.id }
      await db.execute('sessions.bind', { ...scope, providerId: provider.id, model })
      runtime = new ChatRuntime(
        db,
        { read: async () => secret },
        fetch,
        fault === 'timeout' ? 120 : 5000,
      )
      await runtime.initialize()
      const turnId = randomUUID()
      await runtime.execute(
        'chat.start',
        {
          ...scope,
          turnId,
          text: 'Read sentinel.txt safely',
          expectedProviderId: provider.id,
          expectedModel: model,
          mode: 'read-only',
          selectedPaths: [],
        },
        () => true,
      )
      if (fault === 'cancel' || fault === 'shutdown') {
        for (let i = 0; i < 100; i++) {
          const value = await runtime.execute('chat.read', scope, () => true)
          if (value.tools.length) break
          await new Promise((r) => setTimeout(r, 10))
        }
        if (fault === 'cancel')
          await runtime.execute('chat.cancel', { ...scope, turnId }, () => true)
        else await runtime.close()
      }
      let snapshot
      for (let i = 0; i < 500; i++) {
        snapshot = await runtime.execute('chat.read', scope, () => true)
        if (!['pending', 'running'].includes(snapshot.turn.state)) break
        await new Promise((r) => setTimeout(r, 10))
      }
      const expected = {
        401: 'AUTHENTICATION',
        403: 'ACCESS_DENIED',
        429: 'RATE_LIMITED',
        503: 'SERVER_ERROR',
        disconnect: 'DISCONNECTED',
        timeout: 'TIMEOUT',
        cancel: 'CANCELLED',
        shutdown: 'CANCELLED',
      }[fault]
      assert.equal(
        snapshot.turn.error?.code,
        expected,
        `${protocol}/${fault}: ${JSON.stringify(snapshot.turn.error)}`,
      )
      assert.equal(
        snapshot.tools.some((t) => t.state === 'completed'),
        false,
      )
      assert.ok(!JSON.stringify(snapshot).includes(secret))
      if (fault === '429') assert.equal(snapshot.turn.error.retryAfterSeconds, 1)
      const path =
        protocol === 'responses'
          ? 'responses'
          : protocol === 'anthropic-messages'
            ? 'messages'
            : 'chat/completions'
      assert.equal(counts.get(`/v1/${path}:${model}`), 1)
      await runtime.close()
      runtime = null
      checks.push(
        `${protocol}/${fault}: actual outcome ${expected}; one request, no tool execution/retry, no credential in result`,
      )
    }
  assert.equal(await readFile(join(project, 'sentinel.txt'), 'utf8'), 'unchanged')
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await runtime?.close()
  await db?.close()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
