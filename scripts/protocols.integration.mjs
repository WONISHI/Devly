import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-native-protocols-')),
  project = join(root, '项目')
await mkdir(project)
await mkdir(join(project, 'src'))
await writeFile(join(project, 'src/example.ts'), 'export const fixtureNeedle = 42\n')
const failures = [],
  seen = [],
  requests = []
const frame = (value) => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`
const server = createServer(async (req, res) => {
  try {
    let text = ''
    for await (const bytes of req) text += bytes
    const body = JSON.parse(text),
      responses = req.url === '/v1/responses',
      list = responses ? body.input : body.messages.flatMap((m) => m.content),
      results = list.filter((v) => v.type === (responses ? 'function_call_output' : 'tool_result')),
      round = results.length
    requests.push({ responses, round })
    if (round) {
      const last = JSON.parse(results.at(-1)[responses ? 'output' : 'content'])
      assert.ok(last.ok)
      if (round === 1) assert.equal(last.data.matches[0].path, 'src/example.ts')
      else assert.match(last.data.text, /fixtureNeedle/)
    }
    const name = round === 0 ? 'search_text' : 'read_file',
      args = round === 0 ? { query: 'fixtureNeedle' } : { path: 'src/example.ts' },
      id = `native-${round}`
    if (round === 1 && responses)
      assert.ok(
        list.some((v) => v.type === 'reasoning' && v.encrypted_content === 'opaque-reasoning'),
      )
    if (round === 1 && !responses)
      assert.ok(list.some((v) => v.type === 'thinking' && v.signature === 'native-signature'))
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    if (responses) {
      if (round < 2) {
        const tool = {
            type: 'function_call',
            id: `fc-${round}`,
            call_id: id,
            name,
            arguments: JSON.stringify(args),
          },
          reasoning = { type: 'reasoning', id: `r-${round}`, encrypted_content: 'opaque-reasoning' }
        res.end(
          [
            frame({
              type: 'response.output_item.added',
              output_index: 1,
              item: { ...tool, arguments: '' },
            }),
            frame({
              type: 'response.function_call_arguments.delta',
              output_index: 1,
              item_id: tool.id,
              delta: tool.arguments.slice(0, 5),
            }),
            frame({
              type: 'response.function_call_arguments.delta',
              output_index: 1,
              item_id: tool.id,
              delta: tool.arguments.slice(5),
            }),
            frame({
              type: 'response.completed',
              response: {
                status: 'completed',
                output: [reasoning, tool],
                usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
              },
            }),
          ].join(''),
        )
      } else
        res.end(
          frame({
            type: 'response.output_text.delta',
            delta: 'fixtureNeedle = 42，真实工具结果。',
          }) +
            frame({
              type: 'response.completed',
              response: {
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'fixtureNeedle = 42，真实工具结果。' }],
                  },
                ],
                usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
              },
            }),
        )
    } else {
      const events = [
        {
          type: 'message_start',
          message: {
            type: 'message',
            role: 'assistant',
            usage: { input_tokens: 20, output_tokens: 0 },
          },
        },
      ]
      if (round < 2)
        events.push(
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'fixture reasoning' },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'native-signature' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id, name, input: {} },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: JSON.stringify(args) },
          },
          { type: 'content_block_stop', index: 1 },
        )
      else
        events.push(
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'fixtureNeedle = 42，真实工具结果。' },
          },
          { type: 'content_block_stop', index: 0 },
        )
      events.push(
        {
          type: 'message_delta',
          delta: { stop_reason: round < 2 ? 'tool_use' : 'end_turn' },
          usage: { output_tokens: 10 },
        },
        { type: 'message_stop' },
      )
      res.end(events.map(frame).join(''))
    }
  } catch (error) {
    failures.push(error.message)
    res.writeHead(500)
    res.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let db, runtime
try {
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project })
  runtime = new ChatRuntime(db, {
    read: async () => {
      throw new Error('No personal credentials')
    },
  })
  await runtime.initialize()
  for (const protocol of ['responses', 'anthropic-messages']) {
    const provider = await db.execute('providers.save', {
      name: `Local ${protocol}`,
      protocol,
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      model: 'local-fixture',
    })
    const session = await db.execute('sessions.create', { projectId: p.id, title: protocol })
    await db.execute('sessions.bind', {
      projectId: p.id,
      sessionId: session.id,
      providerId: provider.id,
      model: provider.model,
      allowHistory: false,
    })
    const args = {
      projectId: p.id,
      sessionId: session.id,
      turnId: randomUUID(),
      text: 'Find fixtureNeedle and read its file.',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'read-only',
      selectedPaths: [],
    }
    await runtime.execute('chat.start', args, () => true)
    let snapshot
    for (let i = 0; i < 200; i++) {
      snapshot = await runtime.execute(
        'chat.read',
        { projectId: p.id, sessionId: session.id },
        () => true,
      )
      if (!['pending', 'running'].includes(snapshot.turn?.state)) break
      await new Promise((r) => setTimeout(r, 30))
    }
    assert.deepEqual(failures, [])
    assert.equal(snapshot.turn.state, 'completed', JSON.stringify(snapshot.turn.error))
    assert.equal(snapshot.tools.length, 2)
    assert.equal(snapshot.tools[0].callId, 'native-0')
    assert.equal(snapshot.tools[1].callId, 'native-1')
    assert.match(snapshot.tools[1].output, /fixtureNeedle/)
    assert.match(snapshot.text, /42/)
    const count = requests.length
    assert.equal((await runtime.execute('chat.start', args, () => true)).id, args.turnId)
    assert.equal(requests.length, count)
    await assert.rejects(
      runtime.execute('chat.start', { ...args, text: 'changed replay' }, () => true),
    )
    seen.push(
      `${protocol}: native SSE → actual search → actual read → native tool-result continuation → final response`,
    )
  }
  console.log(JSON.stringify({ fixture: true, checks: seen, requests }, null, 2))
} finally {
  await runtime?.close()
  await db?.close()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}
