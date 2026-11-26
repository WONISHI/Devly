// Explicit native acceptance in generated projects. No real supplier, credentials or user files.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'

const root = await mkdtemp(join(tmpdir(), 'devly-execution-acceptance-'))
const project = join(root, 'project')
await mkdir(project)
await writeFile(join(project, 'existing.txt'), 'before')
let database, runtime
const requests = []
const frame = (delta, finish_reason) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, ...(finish_reason ? { finish_reason } : {}) }] })}\n\n`
function call(id, name, args) {
  const text = JSON.stringify(args)
  return (
    frame({
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: text.slice(0, 7) } },
      ],
    }) +
    frame({ tool_calls: [{ index: 0, function: { arguments: text.slice(7) } }] }, 'tool_calls') +
    'data: [DONE]\n\n'
  )
}
const fetcher = async (_url, init) => {
  const body = JSON.parse(init.body)
  requests.push(body)
  const prompt = body.messages.filter((item) => item.role === 'user').at(-1).content
  const results = body.messages.filter((item) => item.role === 'tool')
  let wire
  if (results.length)
    wire = frame({ content: 'Observed: ' + results.at(-1).content }, 'stop') + 'data: [DONE]\n\n'
  else if (prompt === 'command')
    wire = call('command-call', 'run_command', {
      command: 'printf "first\\n"; sleep 0.2; printf second; printf warning >&2; exit 3',
    })
  else if (prompt === 'stop-command')
    wire = call('stop-command-call', 'run_command', {
      command: '(sleep 1; printf late > late.txt) & wait',
      timeoutMs: 10000,
    })
  else
    wire = call(prompt + '-call', 'apply_patch', {
      changes: [
        {
          path: prompt === 'conflict' ? 'existing.txt' : prompt + '.txt',
          expectedHash:
            prompt === 'conflict' ? createHash('sha256').update('before').digest('hex') : null,
          content: 'approved fixture',
        },
      ],
    })
  return new Response(wire, { headers: { 'Content-Type': 'text/event-stream' } })
}
const active = () => true
const checks = []
async function waitFor(scope, predicate) {
  const until = Date.now() + 15000
  while (Date.now() < until) {
    const snapshot = await runtime.execute(
      'chat.read',
      { projectId: scope.projectId, sessionId: scope.sessionId },
      active,
    )
    if (predicate(snapshot)) return snapshot
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('Timed out waiting for run state')
}
try {
  database = new DatabaseClient(join(root, 'profile'))
  await database.ready
  const originalExecute = database.execute.bind(database)
  database.execute = async (operation, args) => {
    try {
      return await originalExecute(operation, args)
    } catch (error) {
      console.error('Failed operation:', operation)
      throw error
    }
  }
  const p = await database.execute('internal.project.upsert', { path: project })
  const provider = await database.execute('providers.save', {
    name: 'LOCAL FIXTURE',
    protocol: 'chat-completions',
    baseUrl: 'http://127.0.0.1:1/v1',
    model: 'fixture',
  })
  const settings = await database.execute('settings.get', { projectId: p.id })
  await database.execute('settings.save', {
    projectId: p.id,
    settings: {
      ...settings,
      projectPermission: 'ask',
      defaultProviderId: provider.id,
      defaultModel: 'fixture',
    },
  })
  runtime = new ChatRuntime(
    database,
    {
      read: async () => {
        throw new Error('No credential expected')
      },
    },
    fetcher,
  )
  await runtime.initialize()
  async function start(prompt) {
    const s = await database.execute('sessions.create', { projectId: p.id, title: prompt })
    const scope = { projectId: p.id, sessionId: s.id, turnId: randomUUID() }
    await runtime.execute(
      'chat.start',
      {
        ...scope,
        text: prompt,
        expectedProviderId: provider.id,
        expectedModel: 'fixture',
        mode: 'project-write',
      },
      active,
    )
    const pending = await waitFor(scope, (snap) => snap.turn?.phase === 'waiting_approval')
    return { scope, pending, tool: pending.tools.find((item) => item.state === 'waiting_approval') }
  }
  const answer = (run, allowed, override = {}) =>
    runtime.execute(
      'chat.approve',
      {
        ...run.scope,
        callId: run.tool.callId,
        approvalId: run.tool.approval.id,
        digest: run.tool.approval.digest,
        allowed,
        ...override,
      },
      active,
    )
  const ended = (run) =>
    waitFor(run.scope, (snap) => !['pending', 'running'].includes(snap.turn?.state))
  const denied = await start('denied')
  await assert.rejects(readFile(join(project, 'denied.txt')), { code: 'ENOENT' })
  assert.equal((await answer(denied, true, { turnId: randomUUID() })).removed, false)
  assert.equal((await answer(denied, true, { digest: '0'.repeat(64) })).removed, false)
  assert.equal((await answer(denied, false)).removed, true)
  assert.equal((await answer(denied, true)).removed, false)
  const d = await ended(denied)
  assert.equal(d.tools[0].state, 'denied')
  assert.ok(d.text.includes('APPROVAL_DENIED'))
  checks.push(
    'No execution before approval; scope, digest and duplicate rejected; denial returned to model',
  )
  const conflict = await start('conflict')
  await writeFile(join(project, 'existing.txt'), 'external edit while waiting')
  await answer(conflict, true)
  const c = await ended(conflict)
  assert.equal(await readFile(join(project, 'existing.txt'), 'utf8'), 'external edit while waiting')
  assert.ok(c.tools[0].output.includes('conflict'))
  checks.push('External edit during approval retained; per-file conflict returned')
  const applied = await start('applied')
  await answer(applied, true)
  const a = await ended(applied)
  assert.equal(a.turn.state, 'completed')
  assert.equal(a.tools[0].state, 'completed')
  assert.equal(await readFile(join(project, 'applied.txt'), 'utf8'), 'approved fixture')
  checks.push('Approved patch executed in isolated helper and durable tool log retained')
  const command = await start('command')
  await answer(command, true)
  const cmd = await ended(command)
  assert.ok(cmd.tools[0].output.includes('first'))
  assert.ok(cmd.tools[0].output.includes('warning'))
  assert.ok(cmd.tools[0].output.includes('"exitCode":3'))
  checks.push('Approved command reports real stdout, stderr and exit code')
  const pendingCancel = await start('pending-cancel')
  await runtime.execute('chat.cancel', pendingCancel.scope, active)
  assert.equal((await ended(pendingCancel)).turn.state, 'cancelled')
  assert.equal((await answer(pendingCancel, true)).removed, false)
  await assert.rejects(readFile(join(project, 'pending-cancel.txt')), { code: 'ENOENT' })
  const running = await start('stop-command')
  await answer(running, true)
  await waitFor(running.scope, (snap) => snap.tools[0]?.state === 'running')
  await runtime.execute('chat.cancel', running.scope, active)
  assert.equal((await ended(running)).turn.state, 'cancelled')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await assert.rejects(readFile(join(project, 'late.txt')), { code: 'ENOENT' })
  checks.push(
    'Pending approval and running command cancellation settle only after cleanup; late write absent',
  )
  await runtime.close()
  await database.close()
  database = new DatabaseClient(join(root, 'profile'))
  await database.ready
  runtime = new ChatRuntime(database, { read: async () => '' }, fetcher)
  await runtime.initialize()
  const restored = await runtime.execute(
    'chat.read',
    { projectId: applied.scope.projectId, sessionId: applied.scope.sessionId },
    active,
  )
  assert.equal(restored.tools[0].approval.state, 'approved')
  assert.equal((await answer(applied, true)).removed, false)
  assert.ok(requests.every((req) => req.tools.some((tool) => tool.function.name === 'apply_patch')))
  checks.push('Restart retains tool/approval history; old approval cannot authorize a new run')
  await runtime.close()
  await database.close()
  const crash = spawnSync(process.execPath, ['scripts/execution-crash.fixture.mjs', root], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 20000,
  })
  assert.equal(crash.status, 0, crash.stderr)
  const interrupted = JSON.parse(await readFile(join(root, 'crash-scope.json'), 'utf8'))
  database = new DatabaseClient(join(root, 'profile'))
  await database.ready
  runtime = new ChatRuntime(database, { read: async () => '' }, fetcher)
  await runtime.initialize()
  const recovered = await runtime.execute(
    'chat.read',
    { projectId: interrupted.scope.projectId, sessionId: interrupted.scope.sessionId },
    active,
  )
  assert.equal(recovered.turn.error.code, 'INTERRUPTED')
  assert.equal(recovered.tools[0].approval.state, 'expired')
  assert.equal((await answer(interrupted, true)).removed, false)
  await assert.rejects(readFile(join(project, 'crash-never.txt')), { code: 'ENOENT' })
  checks.push(
    'Abrupt process termination expires durable pending approval; restart neither executes nor resumes it',
  )
  console.log(JSON.stringify({ fixture: true, platform: process.platform, checks }, null, 2))
} finally {
  await runtime?.close().catch(() => {})
  await database?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
