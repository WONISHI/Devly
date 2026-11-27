import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
import { ScheduleRuntime } from '../out/main/schedule-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-schedules-')),
  requests = [],
  closed = [],
  checks = []
let db,
  chats,
  scheduler,
  now = Date.now()
const server = createServer(async (req, res) => {
  let text = ''
  for await (const c of req) text += c
  const body = JSON.parse(text),
    goal = body.messages.find((m) => m.role === 'user')?.content
  requests.push(goal)
  if (String(goal).includes('HOLD')) {
    res.on('close', () => closed.push(goal))
    return
  }
  assert.ok(
    body.tools.every((t) => ['read_file', 'list_files', 'search_text'].includes(t.function.name)),
  )
  const results = body.messages.filter((m) => m.role === 'tool'),
    name = goal === 'FORGED_WRITE' ? 'apply_patch' : 'read_file',
    delta = results.length
      ? { content: 'Observed actual result: ' + results.at(-1).content }
      : {
          tool_calls: [
            {
              index: 0,
              id: 'scheduled-read',
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify(
                  name === 'read_file'
                    ? { path: 'notes.txt', startLine: 1, limit: 10 }
                    : { changes: [{ path: 'notes.txt', content: 'FORGED' }] },
                ),
              },
            },
          ],
        }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    'data: ' +
      JSON.stringify({
        choices: [{ index: 0, delta, finish_reason: results.length ? 'stop' : 'tool_calls' }],
        usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
      }) +
      '\n\ndata: [DONE]\n\n',
  )
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
async function wait(work) {
  for (let i = 0; i < 600; i++) {
    const result = await work()
    if (result) return result
    await new Promise((r) => setTimeout(r, 10))
  }
  throw Error('Scheduler fixture timeout')
}
try {
  await mkdir(join(root, 'project'))
  await writeFile(join(root, 'project/notes.txt'), 'ACTUAL_SCHEDULE_FILE')
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const project = await db.execute('internal.project.upsert', { path: join(root, 'project') }),
    other = await db.execute('internal.project.upsert', { path: root }),
    provider = await db.execute('providers.save', {
      name: 'Schedule fixture',
      protocol: 'chat-completions',
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      model: 'local-model',
    })
  chats = new ChatRuntime(db, { read: async () => '' })
  await chats.initialize()
  scheduler = new ScheduleRuntime(db, chats, () => now)
  await scheduler.initialize(false)
  const input = {
    projectId: project.id,
    name: 'Actual read',
    prompt: 'READ_ACTUAL_FILE',
    providerId: provider.id,
    model: provider.model,
    intervalSeconds: 60,
    misfire: 'once',
    maxRunsPerDay: 2,
    enabled: false,
    notify: false,
  }
  let config = await scheduler.execute('schedules.save', input)
  now += 120000
  await scheduler.tick()
  assert.equal(requests.length, 0)
  await assert.rejects(scheduler.execute('schedules.run', { projectId: project.id, id: config.id }))
  await assert.rejects(scheduler.execute('schedules.stop', { projectId: other.id, id: config.id }))
  config = await scheduler.execute('schedules.save', { ...input, id: config.id, enabled: true })
  await db.execute('projects.switch', { projectId: project.id })
  const manual = await db.execute('sessions.create', {
    projectId: project.id,
    title: 'manual stays selected',
  })
  for (let i = 0; i < 2; i++) {
    const run = await scheduler.execute('schedules.run', { projectId: project.id, id: config.id })
    const history = await wait(async () => {
      const h = await db.execute('schedules.history', { projectId: project.id, id: config.id })
      return ['completed', 'failed', 'cancelled'].includes(h.find((x) => x.id === run.id)?.state)
        ? h
        : null
    })
    const result = await db.execute('chat.read', {
      projectId: project.id,
      sessionId: history.find((x) => x.id === run.id).sessionId,
    })
    assert.equal(result.tools[0].state, 'completed', JSON.stringify(result))
    assert.ok(result.text.includes('ACTUAL_SCHEDULE_FILE'))
  }
  assert.equal(requests.length, 4)
  for (let i = 0; i < 305; i++) {
    const capped = await scheduler.execute('schedules.run', {
      projectId: project.id,
      id: config.id,
    })
    assert.equal(capped.state, 'skipped')
  }
  assert.equal(requests.length, 4)
  const capped = await scheduler.execute('schedules.run', { projectId: project.id, id: config.id })
  assert.equal(capped.state, 'skipped')
  assert.equal(requests.length, 4)
  assert.equal((await db.execute('bootstrap', {})).activeSessionId, manual.id)
  checks.push(
    'Disabled schedule makes zero requests; explicit enable performs actual read-only file/tool/model loop; daily cap blocks third run; per-run sessions do not switch manual active session; project ownership enforced',
  )
  await scheduler.execute('schedules.stop', { projectId: project.id, id: config.id })
  const skip = await scheduler.execute('schedules.save', {
    ...input,
    name: 'skip',
    enabled: true,
    misfire: 'skip',
    maxRunsPerDay: 20,
  })
  now += 3600000
  await scheduler.tick()
  assert.equal(
    (await db.execute('schedules.history', { projectId: project.id, id: skip.id }))[0].state,
    'skipped',
  )
  await scheduler.execute('schedules.stop', { projectId: project.id, id: skip.id })
  const once = await scheduler.execute('schedules.save', {
    ...input,
    name: 'once',
    enabled: true,
    maxRunsPerDay: 20,
  })
  const before = requests.length
  now += 3600000
  await scheduler.tick()
  await wait(
    async () =>
      (await db.execute('schedules.history', { projectId: project.id, id: once.id }))[0]?.state ===
      'completed',
  )
  assert.equal(requests.length, before + 2)
  await scheduler.tick()
  assert.equal(requests.length, before + 2)
  await scheduler.execute('schedules.stop', { projectId: project.id, id: once.id })
  const forged = await scheduler.execute('schedules.save', {
    ...input,
    name: 'hidden tool guard',
    prompt: 'FORGED_WRITE',
    enabled: true,
    maxRunsPerDay: 20,
  })
  await scheduler.execute('schedules.run', { projectId: project.id, id: forged.id })
  const h = await wait(async () => {
    const h = await db.execute('schedules.history', { projectId: project.id, id: forged.id })
    return h[0]?.state === 'completed' ? h[0] : null
  })
  const s = await db.execute('chat.read', { projectId: project.id, sessionId: h.sessionId })
  assert.equal(s.tools[0].error, 'UNKNOWN_TOOL')
  assert.equal(await readFile(join(root, 'project/notes.txt'), 'utf8'), 'ACTUAL_SCHEDULE_FILE')
  await scheduler.execute('schedules.stop', { projectId: project.id, id: forged.id })
  checks.push(
    'Injected-clock sleep gap skips or catches up once without burst; duplicate tick makes no replay; forged unregistered write tool rejected before dispatch and actual file unchanged',
  )
  const hold = await scheduler.execute('schedules.save', {
      ...input,
      name: 'stop isolation',
      prompt: 'SCHEDULE_HOLD',
      enabled: true,
      maxRunsPerDay: 20,
    }),
    holdRun = await scheduler.execute('schedules.run', { projectId: project.id, id: hold.id })
  await wait(() => requests.includes('SCHEDULE_HOLD'))
  const session = await db.execute('sessions.create', {
      projectId: project.id,
      title: 'separate manual',
    }),
    turnId = randomUUID()
  await db.execute('sessions.bind', {
    projectId: project.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
  })
  await chats.execute(
    'chat.start',
    {
      projectId: project.id,
      sessionId: session.id,
      turnId,
      text: 'MANUAL_HOLD',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'read-only',
      selectedPaths: [],
    },
    () => true,
  )
  await wait(() => requests.includes('MANUAL_HOLD'))
  await scheduler.execute('schedules.stop', { projectId: project.id, id: hold.id })
  await wait(() => closed.includes('SCHEDULE_HOLD'))
  assert.ok(!closed.includes('MANUAL_HOLD'))
  assert.equal(
    (await db.execute('schedules.history', { projectId: project.id, id: hold.id })).find(
      (r) => r.id === holdRun.id,
    ).state,
    'cancelled',
  )
  await chats.cancelScope(project.id, session.id)
  scheduler.suspend()
  now += 3600000
  const paused = requests.length
  await scheduler.tick()
  assert.equal(requests.length, paused)
  scheduler.resume()
  await scheduler.close()
  checks.push(
    'Stopping one scheduled active HTTP run waits for cancellation and leaves separate manual run alive; suspend prevents dispatch; no automatic replay of held request',
  )
  // A real prior claim survives disk reopen but is recovered as interrupted, never replayed.
  const recovery = await db.execute('schedules.save', {
      ...input,
      name: 'restart',
      enabled: true,
      maxRunsPerDay: 20,
    }),
    claimed = await db.execute('internal.schedules.claim', {
      projectId: project.id,
      id: recovery.id,
      revision: recovery.revision,
      now,
      force: true,
    })
  await chats.close()
  await db.close()
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  chats = new ChatRuntime(db, { read: async () => '' })
  await chats.initialize()
  scheduler = new ScheduleRuntime(db, chats, () => now)
  await scheduler.initialize(false)
  assert.equal(
    (await db.execute('schedules.history', { projectId: project.id, id: recovery.id })).find(
      (r) => r.id === claimed.id,
    ).state,
    'interrupted',
  )
  const backup = await db.execute('internal.storage.backup', { path: join(root, 'backup') })
  const copy = new Database(join(root, 'backup/devly.sqlite'), { readonly: true })
  try {
    assert.ok(
      copy
        .prepare('SELECT body FROM local_schedules')
        .all()
        .every((r) => JSON.parse(r.body).enabled === false),
    )
    assert.equal(copy.pragma('user_version', { simple: true }), 15)
    assert.ok(
      copy.prepare('SELECT count(*) AS n FROM schedule_runs WHERE schedule_id=?').get(config.id)
        .n <= 300,
    )
    assert.equal(
      copy
        .prepare('SELECT count FROM schedule_daily_counts WHERE schedule_id=? ORDER BY day LIMIT 1')
        .get(config.id).count,
      2,
    )
  } finally {
    copy.close()
  }
  const beforeRestore = requests.length
  await db.execute('internal.storage.stage', { path: join(root, 'backup'), digest: backup.digest })
  await assert.rejects(
    scheduler.execute('schedules.run', { projectId: project.id, id: recovery.id }),
  )
  await scheduler.tick()
  assert.equal(requests.length, beforeRestore)
  await db.execute('storage.restore.cancel', {})
  scheduler.setGuard(() => false)
  await assert.rejects(
    scheduler.execute('schedules.run', { projectId: project.id, id: recovery.id }),
  )
  assert.equal(requests.length, beforeRestore)
  checks.push(
    'Actual pending restore and Main storage guard prevent scheduled dispatch; no HTTP or duplicate claim while restoration is staged',
  )
  checks.push(
    'Actual SQLite reopen marks old claim interrupted; backup v15 disables every schedule, retains ledger and no credential contents; explicit re-enable required after restore',
  )
  console.log(JSON.stringify({ ok: true, checks, requests: requests.length }, null, 2))
} finally {
  await scheduler?.close()
  await chats?.close()
  await db?.close()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
