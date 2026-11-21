import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseClient, migrations } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const require = createRequire(import.meta.url),
  SQLite = require('better-sqlite3')
const root = await mkdtemp(join(tmpdir(), 'devly-chat-'))
let database, runtime
const passed = [],
  captured = [],
  secret = 'sk-fixture-should-never-be-visible'
const frame = (delta, finish = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const fetcher = async (_url, init) => {
  const body = JSON.parse(init.body),
    prompt = body.messages.at(-1).content
  captured.push({ body, hasAuth: init.headers.Authorization === `Bearer ${secret}` })
  if (prompt === 'auth-error')
    return new Response('untrusted error body ' + secret, { status: 401 })
  if (prompt === 'slow' || prompt === 'crash') {
    const signal = init.signal
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame({ content: 'saved partial' })))
          const abort = () => controller.error(new Error('aborted'))
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort, { once: true })
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  }
  if (prompt === 'disconnect')
    return new Response(frame({ content: 'incomplete' }), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  if (prompt === 'tool')
    return new Response(
      frame({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'execute', arguments: '{}' },
          },
        ],
      }) +
        frame({}, 'tool_calls') +
        'data: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  const chunks =
    prompt === 'echo-secret'
      ? ['before ', secret.slice(0, 12), secret.slice(12), ' after']
      : [`reply:${prompt}`]
  return new Response(
    chunks.map((delta) => frame({ content: delta })).join('') +
      frame({}, prompt === 'length' ? 'length' : 'stop') +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}
async function wait(predicate) {
  const until = Date.now() + 5000
  while (Date.now() < until) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('chat fixture timeout')
}
async function rejects(operation, code) {
  await assert.rejects(operation, (error) => error.info?.code === code)
}
try {
  const projectPath = join(root, '项目 with spaces')
  await mkdir(projectPath)
  const storage = join(root, 'storage')
  database = new DatabaseClient(storage)
  await database.ready
  const project = await database.execute('internal.project.upsert', { path: projectPath })
  const otherPath = join(root, '其他项目')
  await mkdir(otherPath)
  const other = await database.execute('internal.project.upsert', { path: otherPath })
  const provider = await database.execute('providers.save', {
    name: 'fixture',
    protocol: 'chat-completions',
    baseUrl: 'https://fixture.invalid/v1',
    model: 'fixture-model',
  })
  await database.execute('internal.credential.ref', { providerId: provider.id, ref: randomUUID() })
  const second = await database.execute('providers.save', {
    name: 'second fixture',
    protocol: 'chat-completions',
    baseUrl: 'https://other.invalid/v1',
    model: 'other-model',
  })
  const defaults = await database.execute('settings.get', { projectId: project.id })
  await database.execute('settings.save', {
    projectId: project.id,
    settings: {
      ...defaults,
      defaultProviderId: provider.id,
      defaultModel: provider.model,
      maxTokens: 2048,
    },
  })
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher)
  await runtime.initialize()
  async function session() {
    return database.execute('sessions.create', { projectId: project.id })
  }
  async function start(target, text) {
    const binding = await database.execute('sessions.get', {
      projectId: project.id,
      sessionId: target.id,
    })
    return runtime.execute(
      'chat.start',
      {
        projectId: project.id,
        sessionId: target.id,
        turnId: randomUUID(),
        text,
        expectedProviderId: binding.providerId,
        expectedModel: binding.model,
      },
      () => true,
    )
  }
  async function snapshot(target) {
    return database.execute('chat.read', { projectId: project.id, sessionId: target.id })
  }
  async function finished(target) {
    await wait(async () => !['running', 'pending'].includes((await snapshot(target)).turn?.state))
    return snapshot(target)
  }
  const a = await session(),
    b = await session()
  assert.equal(a.providerId, provider.id)
  await start(a, 'first')
  assert.equal((await finished(a)).text, 'reply:first')
  assert.deepEqual(
    (await snapshot(a)).turn.usage,
    { inputTokens: null, outputTokens: null, totalTokens: null },
    'missing usage is unknown, not fabricated',
  )
  await start(a, 'second')
  await finished(a)
  assert.deepEqual(
    captured[1].body.messages.map((message) => message.content),
    ['first', 'reply:first', 'second'],
  )
  assert.equal(captured[0].body.max_tokens, 2048)
  assert.equal(captured[0].body.tools, undefined)
  assert.equal(captured[0].hasAuth, true)
  passed.push(
    'durable paired messages, real adapter stream, explicit model and budget, completed-turn context only; no fake tools/usage',
  )
  await rejects(
    database.execute('sessions.bind', {
      projectId: project.id,
      sessionId: a.id,
      providerId: second.id,
      model: second.model,
    }),
    'HISTORY_CONFIRMATION_REQUIRED',
  )
  await database.execute('sessions.bind', {
    projectId: project.id,
    sessionId: a.id,
    providerId: second.id,
    model: second.model,
    allowHistory: true,
    setDefault: true,
  })
  const selectedDefaults = await database.execute('settings.get', { projectId: project.id })
  assert.equal(selectedDefaults.defaultProviderId, second.id)
  assert.equal(selectedDefaults.maxTokens, 2048)
  await database.execute('settings.save', {
    projectId: project.id,
    settings: { ...selectedDefaults, defaultProviderId: provider.id, defaultModel: provider.model },
  })
  assert.equal(
    (await database.execute('sessions.get', { projectId: project.id, sessionId: a.id })).providerId,
    second.id,
  )
  assert.equal(
    (await snapshot(a)).turn.providerId,
    provider.id,
    'old turn identity stays unchanged',
  )
  assert.equal(captured.length, 2, 'binding itself sends no requests')
  await rejects(
    runtime.execute(
      'chat.start',
      {
        projectId: project.id,
        sessionId: a.id,
        turnId: randomUUID(),
        text: 'stale UI must not send',
        expectedProviderId: provider.id,
        expectedModel: provider.model,
      },
      () => true,
    ),
    'BINDING_CHANGED',
  )
  assert.equal(captured.length, 2)
  passed.push(
    'session model binding requires explicit history consent; past turn identity stays fixed and binding sends nothing',
  )
  await start(b, 'slow')
  await wait(async () => (await snapshot(b)).text === 'saved partial')
  await rejects(start(b, 'duplicate'), 'CHAT_BUSY')
  await rejects(
    runtime.execute(
      'chat.cancel',
      { projectId: other.id, sessionId: b.id, turnId: (await snapshot(b)).turn.id },
      () => true,
    ),
    'NOT_FOUND',
  )
  await runtime.execute(
    'chat.cancel',
    { projectId: project.id, sessionId: b.id, turnId: (await snapshot(b)).turn.id },
    () => true,
  )
  assert.equal((await finished(b)).turn.state, 'cancelled')
  assert.equal((await snapshot(b)).text, 'saved partial')
  await start(b, 'after-cancel')
  await finished(b)
  assert.deepEqual(
    captured.at(-1).body.messages.map((message) => message.content),
    ['after-cancel'],
  )
  assert.equal((await snapshot(a)).text, 'reply:second')
  passed.push(
    'one active turn per session; cross-project cancellation rejected; partial output retained and cancelled context excluded',
  )
  const c = await session()
  for (const [input, code] of [
    ['auth-error', 'AUTHENTICATION'],
    ['disconnect', 'DISCONNECTED'],
    ['tool', 'UNSUPPORTED'],
  ]) {
    await start(c, input)
    const result = await finished(c)
    assert.equal(result.turn.state, 'failed')
    assert.equal(result.turn.error.code, code)
    assert.equal(JSON.stringify(result).includes(secret), false)
  }
  await start(c, 'echo-secret')
  const clean = await finished(c)
  assert.equal(clean.text, 'before [REDACTED] after')
  const records = await database.execute('sessions.messages', {
    projectId: project.id,
    sessionId: c.id,
    limit: 100,
  })
  assert.equal(JSON.stringify(records).includes(secret), false)
  await start(c, 'length')
  assert.equal((await finished(c)).turn.finish, 'length')
  passed.push(
    '401/disconnect/unexpected tools distinguish failure; split credential echoes redacted before DTO/database; output limit recorded',
  )
  for (let i = 0; i < 12; i++) {
    await start(a, `page-${i}`)
    await finished(a)
  }
  const page1 = await database.execute('sessions.messages', {
    projectId: project.id,
    sessionId: a.id,
    limit: 7,
  })
  const page2 = await database.execute('sessions.messages', {
    projectId: project.id,
    sessionId: a.id,
    limit: 7,
    cursor: page1.nextCursor,
  })
  assert.equal(new Set([...page1.items, ...page2.items].map((message) => message.id)).size, 14)
  await runtime.close()
  await database.close()
  database = new DatabaseClient(storage)
  await database.ready
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher)
  await runtime.initialize()
  assert.equal(
    (await database.execute('sessions.get', { projectId: project.id, sessionId: a.id })).providerId,
    second.id,
  )
  await start(a, 'restart')
  await finished(a)
  assert.equal(captured.at(-1).body.messages.at(-2).content, 'reply:page-11')
  passed.push(
    'cursor pagination has no duplicates; restart restores bound model and prior completed context',
  )
  await start(b, 'crash')
  await wait(async () => (await snapshot(b)).text === 'saved partial')
  await database.close()
  await runtime.close()
  database = new DatabaseClient(storage)
  await database.ready
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher)
  await runtime.initialize()
  assert.equal((await snapshot(b)).turn.error.code, 'INTERRUPTED')
  assert.equal((await snapshot(b)).text, 'saved partial')
  const before = captured.length
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(captured.length, before, 'restart must not auto-resend interrupted work')
  passed.push(
    'interrupted generation becomes failed on restart, preserves saved content, never automatically resends',
  )
  await start(b, 'slow')
  await runtime.close()
  assert.equal((await snapshot(b)).turn.state, 'cancelled')
  passed.push('graceful shutdown aborts and durably finalizes before database closes')
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher, 25)
  await start(b, 'slow')
  assert.equal((await finished(b)).turn.error.code, 'TIMEOUT')
  await runtime.close()
  runtime = new ChatRuntime(
    database,
    {
      read: async () => {
        throw new Error('unavailable')
      },
    },
    fetcher,
  )
  const beforeCredential = captured.length
  await rejects(start(b, 'must-not-send'), 'CREDENTIAL_UNAVAILABLE')
  assert.equal(captured.length, beforeCredential)
  await runtime.close()
  runtime = new ChatRuntime(database, { read: async () => secret }, fetcher)
  await start(b, 'slow')
  await rejects(
    database.execute('sessions.bind', {
      projectId: project.id,
      sessionId: b.id,
      providerId: second.id,
      model: second.model,
      allowHistory: true,
    }),
    'CHAT_BUSY',
  )
  runtime.clearProvider(provider.id)
  assert.equal((await finished(b)).turn.error.code, 'CONFIG_CHANGED')
  const limited = await session(),
    config = await database.execute('internal.provider.config', { providerId: provider.id })
  const largeTurn = randomUUID()
  await database.execute('internal.chat.begin', {
    projectId: project.id,
    sessionId: limited.id,
    turnId: largeTurn,
    providerId: provider.id,
    model: provider.model,
    revision: config.revision,
    text: 'x'.repeat(32768),
  })
  await database.execute('internal.chat.update', {
    projectId: project.id,
    sessionId: limited.id,
    turnId: largeTurn,
    state: 'completed',
    phase: 'completed',
    endedAt: Date.now(),
    text: 'y'.repeat(240000),
  })
  const beforeLimit = captured.length
  await rejects(start(limited, 'must-not-truncate'), 'CONTEXT_LIMIT')
  assert.equal(captured.length, beforeLimit)
  const slots = [await session(), await session(), await session(), await session()]
  for (const slot of slots) await start(slot, 'slow')
  await rejects(start(await session(), 'fifth'), 'LIMIT_EXCEEDED')
  await runtime.close()
  for (const slot of slots) assert.equal((await snapshot(slot)).turn.state, 'cancelled')
  passed.push(
    'timeout/configuration changes are distinct; unreadable credential and oversized context send no HTTP; active binding locked and four-run concurrency enforced',
  )
  const migrationRoot = join(root, 'legacy-v3')
  await mkdir(migrationRoot)
  const legacy = new SQLite(join(migrationRoot, 'devly.sqlite'))
  for (const migration of migrations.slice(0, 3)) legacy.exec(migration.sql)
  legacy.pragma('user_version = 3')
  const pid = randomUUID(),
    sid = randomUUID()
  legacy
    .prepare('INSERT INTO projects(id,path,name,last_opened_at) VALUES(?,?,?,1)')
    .run(pid, projectPath, 'legacy')
  legacy
    .prepare('INSERT INTO sessions(id,project_id,title,updated_at) VALUES(?,?,?,1)')
    .run(sid, pid, 'legacy session')
  for (let i = 0; i < 2; i++)
    legacy
      .prepare("INSERT INTO turns(id,session_id,project_id,status) VALUES(?,?,?,'running')")
      .run(randomUUID(), sid, pid)
  legacy.close()
  const upgraded = new DatabaseClient(migrationRoot)
  await upgraded.ready
  assert.equal(
    (await upgraded.execute('sessions.get', { projectId: pid, sessionId: sid })).title,
    'legacy session',
  )
  assert.equal((await upgraded.execute('internal.status')).schemaVersion, 4)
  assert.equal(
    (await upgraded.execute('chat.read', { projectId: pid, sessionId: sid })).turn.state,
    'failed',
  )
  await upgraded.close()
  passed.push(
    'v3 migration preserves session metadata and recovers duplicate legacy active turns before unique index',
  )
  console.log(
    JSON.stringify(
      { fixture: 'local/injected only, not a real supplier', passed, requests: captured.length },
      null,
      2,
    ),
  )
} finally {
  await runtime?.close()
  await database?.close()
  await rm(root, { recursive: true, force: true })
}
