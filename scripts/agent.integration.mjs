import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-agent-')),
  projectPath = join(root, 'project')
await mkdir(projectPath)
await mkdir(join(projectPath, 'src'))
await writeFile(join(projectPath, 'src/target.ts'), 'export const value = 7\n// TARGET_MARKER\n')
await writeFile(
  join(projectPath, 'AGENTS.md'),
  'Use evidence and cite file lines. Do not claim writes.',
)
let database, runtime
const requests = [],
  secret = 'sk-fixture-agent-private-value'
const frame = (delta, reason) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(reason ? { finish_reason: reason } : {}) }] })}\n\n`
function stream(wire, signal, hang = false) {
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(wire))
        if (hang) {
          const abort = () => c.error(new Error('aborted'))
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        } else c.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
function call(id, name, args) {
  const text = typeof args === 'string' ? args : JSON.stringify(args)
  return (
    frame({
      reasoning_content: 'private fixture reasoning',
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: text.slice(0, 8) } },
      ],
    }) +
    frame({ tool_calls: [{ index: 0, function: { arguments: text.slice(8) } }] }, 'tool_calls') +
    'data: [DONE]\n\n'
  )
}
const fetcher = async (_url, init) => {
  const body = JSON.parse(init.body),
    prompt = body.messages.filter((m) => m.role === 'user').at(-1).content,
    results = body.messages.filter((m) => m.role === 'tool')
  requests.push(body)
  if (prompt === 'malformed') return stream(call('bad', 'read_file', '{"path":'), init.signal)
  if (prompt === 'cancel')
    return stream(
      frame({
        tool_calls: [
          {
            index: 0,
            id: 'partial',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":' },
          },
        ],
      }),
      init.signal,
      true,
    )
  if (prompt === 'unknown')
    return stream(
      results.length
        ? frame({ content: 'Unregistered tool was rejected.' }, 'stop') + 'data: [DONE]\n\n'
        : call('unknown', 'write_file', { path: 'new-file', content: 'bad' }),
      init.signal,
    )
  if (prompt === 'loop')
    return stream(call('loop-' + results.length, 'list_files', { path: '.' }), init.signal)
  if (prompt === 'large-output')
    return stream(
      results.length
        ? frame({ content: 'partial output not complete' }, 'stop') + 'data: [DONE]\n\n'
        : call('large', 'read_file', { path: 'long.txt', limit: 300 }),
      init.signal,
    )
  if (prompt === 'no-output-left')
    return stream(
      frame({ content: 'x'.repeat(800) }) +
        call('no-budget', 'read_file', { path: 'long.txt', limit: 300 }),
      init.signal,
    )
  if (prompt === 'slow') return stream('', init.signal, true)
  if (!results.length)
    return stream(
      call('search-call', 'search_text', { query: 'TARGET_MARKER', path: 'src' }),
      init.signal,
    )
  if (results.length === 1) {
    assert.equal(
      body.messages.find((m) => m.tool_calls)?.reasoning_content,
      'private fixture reasoning',
    )
    return stream(
      call('read-call', 'read_file', { path: 'src/target.ts', startLine: 1, limit: 3 }),
      init.signal,
    )
  }
  assert.equal(results[0].tool_call_id, 'search-call')
  assert.equal(results[1].tool_call_id, 'read-call')
  return stream(
    frame({ content: 'Found TARGET_MARKER at src/target.ts:2.' }, 'stop') + 'data: [DONE]\n\n',
    init.signal,
  )
}
async function wait(check) {
  for (let i = 0; i < 500; i++) {
    const result = await check()
    if (result) return result
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('Agent test timed out')
}
try {
  database = new DatabaseClient(join(root, 'data'))
  await database.ready
  const project = await database.execute('internal.project.upsert', { path: projectPath })
  const provider = await database.execute('providers.save', {
    name: 'Local agent fixture',
    protocol: 'chat-completions',
    baseUrl: 'https://fixture.invalid/v1',
    model: 'fixture',
  })
  await database.execute('internal.credential.ref', { providerId: provider.id, ref: randomUUID() })
  const settings = await database.execute('settings.get', { projectId: project.id })
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...settings, defaultProviderId: provider.id, defaultModel: provider.model },
  })
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher)
  await runtime.initialize()
  const scope = (session) => ({ projectId: project.id, sessionId: session.id })
  async function start(text, options = {}) {
    const session = await database.execute('sessions.create', { projectId: project.id })
    await runtime.execute(
      'chat.start',
      {
        ...scope(session),
        turnId: randomUUID(),
        text,
        expectedProviderId: provider.id,
        expectedModel: provider.model,
        mode: 'read-only',
        selectedPaths: [],
        ...options,
      },
      () => true,
    )
    return session
  }
  async function finished(session) {
    return wait(async () => {
      const s = await database.execute('chat.read', scope(session))
      return s.turn && !['running', 'pending'].includes(s.turn.state) ? s : null
    })
  }
  const session = await start('multi')
  let result = await finished(session)
  assert.equal(result.turn.state, 'completed')
  assert.equal(result.turn.agent.rounds, 3)
  assert.equal(result.turn.agent.calls, 2)
  assert.equal(result.turn.agent.git.before.available, false)
  assert.equal(result.turn.agent.git.after.available, false)
  assert.deepEqual(
    result.tools.map((t) => [t.callId, t.state]),
    [
      ['search-call', 'completed'],
      ['read-call', 'completed'],
    ],
  )
  assert.ok(result.turn.agent.sources.some((s) => s.path === 'AGENTS.md'))
  assert.equal(result.turn.usage.totalTokens, null)
  for (const tool of result.tools) {
    assert.ok(tool.blobId)
    const blob = await database.execute('blobs.read', {
      ...scope(session),
      blobId: tool.blobId,
      length: 65536,
    })
    assert.ok(Buffer.from(blob.base64, 'base64').toString().includes('TARGET_MARKER'))
  }
  assert.equal(JSON.stringify(result).includes('private fixture reasoning'), false)
  const history = await database.execute('sessions.messages', { ...scope(session), limit: 20 })
  assert.equal(history.items.find((m) => m.role === 'assistant').tools.length, 2)
  const general = await database.execute('sessions.general', {})
  const originalCount = requests.length
  await database.execute('sessions.bind', {
    projectId: general.projectId,
    sessionId: general.id,
    providerId: provider.id,
    model: provider.model,
    allowHistory: false,
    setDefault: false,
  })
  await assert.rejects(
    runtime.execute(
      'chat.start',
      {
        projectId: general.projectId,
        sessionId: general.id,
        turnId: randomUUID(),
        text: 'do not read managed data',
        mode: 'read-only',
        expectedProviderId: provider.id,
        expectedModel: provider.model,
        selectedPaths: [],
      },
      () => true,
    ),
  )
  assert.equal(
    requests.length,
    originalCount,
    'general-chat storage cannot be used as an agent project',
  )
  const bad = await start('malformed')
  result = await finished(bad)
  assert.equal(result.turn.state, 'failed')
  assert.equal(result.turn.error.code, 'INVALID_RESPONSE')
  assert.equal(result.tools[0].state, 'failed')
  assert.equal(result.tools[0].blobId, null)
  const unknown = await start('unknown')
  result = await finished(unknown)
  assert.equal(result.tools[0].error, 'UNKNOWN_TOOL')
  assert.equal(result.turn.state, 'completed')
  await assert.rejects(readFile(join(projectPath, 'new-file')))
  const cancelled = await start('cancel')
  await wait(async () => (await database.execute('chat.read', scope(cancelled))).tools.length)
  await runtime.execute(
    'chat.cancel',
    {
      ...scope(cancelled),
      turnId: (await database.execute('chat.read', scope(cancelled))).turn.id,
    },
    () => true,
  )
  result = await finished(cancelled)
  assert.equal(result.turn.state, 'cancelled')
  assert.equal(result.tools[0].state, 'cancelled')
  const current = await database.execute('settings.get', { projectId: project.id })
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...current, agentLimits: { ...current.agentLimits, maxRounds: 2, maxCalls: 2 } },
  })
  result = await finished(await start('loop'))
  assert.equal(result.turn.error.code, 'LIMIT')
  assert.match(result.turn.error.message, /轮数/)
  await writeFile(join(projectPath, 'long.txt'), 'word '.repeat(2400))
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...current, agentLimits: { ...current.agentLimits, maxOutputChars: 1024 } },
  })
  result = await finished(await start('large-output'))
  assert.equal(result.tools[0].truncated, true)
  assert.equal(result.tools[0].error, 'OUTPUT_BUDGET')
  assert.ok(result.tools[0].blobId)
  result = await finished(await start('no-output-left'))
  assert.equal(result.turn.error.code, 'LIMIT')
  assert.equal(result.tools[0].state, 'failed')
  assert.equal(result.tools[0].error, 'OUTPUT_BUDGET')
  assert.equal(result.tools[0].blobId, null)
  await runtime.close()
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher, 35)
  await runtime.initialize()
  await database.execute('settings.save', { projectId: project.id, settings: current })
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...current, agentLimits: { ...current.agentLimits, maxCalls: 1 } },
  })
  result = await finished(await start('loop'))
  assert.equal(result.turn.error.code, 'LIMIT')
  assert.equal(result.turn.agent.calls, 1)
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...current, agentLimits: { ...current.agentLimits, maxRounds: 1 } },
  })
  result = await finished(await start('loop'))
  assert.equal(result.turn.error.code, 'LIMIT')
  assert.equal(result.turn.agent.calls, 0)
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...current, maxTokens: 256 },
  })
  result = await finished(await start('loop'))
  assert.equal(result.turn.error.code, 'LIMIT')
  assert.equal(result.turn.agent.rounds, 1)
  await database.execute('settings.save', { projectId: project.id, settings: current })
  result = await finished(await start('slow'))
  assert.equal(result.turn.error.code, 'TIMEOUT')
  await runtime.close()
  await database.close()
  database = new DatabaseClient(join(root, 'data'))
  await database.ready
  result = await database.execute('chat.read', scope(session))
  assert.equal(result.tools.length, 2)
  assert.equal(result.turn.agent.mode, 'read-only')
  assert.ok(result.turn.agent.git?.before)
  for (const name of await readdir(join(root, 'data/blobs')))
    assert.equal(
      (await readFile(join(root, 'data/blobs', name))).includes(Buffer.from(secret)),
      false,
    )
  console.log(
    JSON.stringify(
      {
        fixture: 'local injected protocol only; no real supplier',
        passed: [
          'search → read → final answer through real adapter and SQLite Worker; tool IDs and reasoning replay match',
          'partial and malformed parameters never execute; unknown write tool rejected',
          'tool state and full redacted blob references persist across restart',
          'cancellation, timeout, round/call and output budgets stop correctly; truncated output is explicit',
        ],
        requests: requests.length,
      },
      null,
      2,
    ),
  )
} finally {
  await runtime?.close()
  await database?.close()
  await rm(root, { recursive: true, force: true })
}
