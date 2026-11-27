// Real persisted interrupted state; a local fetch fixture only starts after explicit recovery confirmation.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-recovery-')),
  project = join(root, 'project'),
  storage = join(root, 'storage')
await mkdir(project)
await writeFile(join(project, 'file.ts'), 'original\n')
let db, runtime
const checks = []
let requests = 0
try {
  db = new DatabaseClient(storage)
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'fixture',
      protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'fixture',
    }),
    session = await db.execute('sessions.create', { projectId: p.id })
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
  })
  const scope = { projectId: p.id, sessionId: session.id, turnId: randomUUID() },
    config = await db.execute('internal.provider.config', { providerId: provider.id })
  await db.execute('internal.chat.begin', {
    ...scope,
    providerId: provider.id,
    model: provider.model,
    revision: config.revision,
    text: 'Inspect file.ts and fix it.',
    expectedProviderId: provider.id,
    expectedModel: provider.model,
    agent: { mode: 'project-write', git: null, sources: [], summaries: [], rounds: 1, calls: 2 },
  })
  const first = {
    id: randomUUID(),
    callId: 'read-old',
    name: 'read_file',
    state: 'completed',
    approval: null,
    execution: null,
    input: '{"path":"file.ts"}',
    output: JSON.stringify({
      ok: true,
      data: {
        path: 'file.ts',
        contentHash: createHash('sha256').update('original\n').digest('hex'),
      },
    }),
    error: null,
    truncated: false,
    blobId: null,
    position: 0,
  }
  await db.execute('internal.chat.tool', { ...scope, tool: first })
  const pending = {
    ...first,
    id: randomUUID(),
    callId: 'command-old',
    name: 'run_command',
    state: 'running',
    input: '{"command":"do not replay"}',
    output: '',
    approval: {
      id: randomUUID(),
      digest: 'a'.repeat(64),
      expiresAt: Date.now() + 60000,
      state: 'pending',
    },
    position: 1,
  }
  await db.execute('internal.chat.tool', { ...scope, tool: pending })
  await db.execute('internal.chat.approval', {
    ...scope,
    toolId: pending.id,
    approval: pending.approval,
  })
  await db.close()
  db = new DatabaseClient(storage)
  await db.ready
  const fetcher = async (_url, init) => {
    requests++
    const body = JSON.parse(init.body)
    assert.ok(
      body.tools.every((t) => ['list_files', 'read_file', 'search_text'].includes(t.function.name)),
    )
    assert.match(body.messages.at(-1).content, /不重放/)
    return new Response(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: '本地恢复核对完成，未执行旧命令。' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }
  runtime = new ChatRuntime(db, { read: async () => '' }, fetcher)
  await runtime.initialize()
  const snapshot = await runtime.execute(
    'chat.read',
    { projectId: p.id, sessionId: session.id },
    () => true,
  )
  assert.equal(snapshot.turn.error.code, 'INTERRUPTED')
  assert.equal(snapshot.tools[1].approval.state, 'expired')
  assert.equal(snapshot.tools[1].error, 'EXECUTION_STATE_UNKNOWN')
  await writeFile(join(project, 'file.ts'), 'external edit\n')
  let preview = await runtime.execute('chat.recovery.inspect', scope, () => true, 'owner')
  assert.equal(requests, 0)
  assert.equal(preview.mode, 'read-only')
  assert.equal(preview.checks.find((c) => c.kind === 'processes').state, 'unknown')
  assert.equal(preview.files[0].state, 'changed')
  const proceed = { ...scope, token: preview.token, newTurnId: randomUUID() }
  await assert.rejects(
    runtime.execute('chat.recovery.continue', proceed, () => true, 'wrong-owner'),
  )
  await writeFile(join(project, 'file.ts'), 'changed after review\n')
  await assert.rejects(runtime.execute('chat.recovery.continue', proceed, () => true, 'owner'))
  assert.equal(requests, 0)
  preview = await runtime.execute('chat.recovery.inspect', scope, () => true, 'owner')
  const accepted = await runtime.execute(
    'chat.recovery.continue',
    { ...scope, token: preview.token, newTurnId: randomUUID() },
    () => true,
    'owner',
  )
  assert.notEqual(accepted.id, scope.turnId)
  assert.equal(accepted.agent.mode, 'read-only')
  for (let i = 0; i < 100; i++) {
    const current = await runtime.execute(
      'chat.read',
      { projectId: p.id, sessionId: session.id },
      () => true,
    )
    if (current.turn.state === 'completed') break
    await new Promise((r) => setTimeout(r, 20))
  }
  assert.equal(requests, 1)
  assert.equal(await readFile(join(project, 'file.ts'), 'utf8'), 'changed after review\n')
  await assert.rejects(
    runtime.execute(
      'chat.recovery.continue',
      { ...scope, token: preview.token, newTurnId: randomUUID() },
      () => true,
      'owner',
    ),
  )
  checks.push(
    'Restart expires approvals, marks old command state unknown, reads actual file changes and makes zero requests before confirmation',
  )
  checks.push(
    'Wrong owner, changed file checkpoint and reused recovery token rejected; explicit continuation uses fresh read-only turn without old command replay',
  )
  await db.execute('providers.save', {
    id: provider.id,
    name: 'edited endpoint',
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    model: provider.model,
  })
  const changed = await runtime.execute('chat.recovery.inspect', scope, () => true, 'owner')
  assert.equal(changed.canContinue, false)
  assert.equal(changed.checks.find((c) => c.kind === 'model').state, 'changed')
  checks.push(
    'Changed provider revision blocks continuation rather than silently forwarding old project context',
  )
  const orphanScopes = []
  for (let i = 0; i < 2; i++) {
    const item = await db.execute('sessions.create', { projectId: p.id })
    await db.execute('sessions.bind', {
      projectId: p.id,
      sessionId: item.id,
      providerId: provider.id,
      model: provider.model,
    })
    const orphan = { projectId: p.id, sessionId: item.id, turnId: randomUUID() }
    await db.execute('internal.chat.begin', {
      ...orphan,
      providerId: provider.id,
      model: provider.model,
      revision: (await db.execute('internal.provider.config', { providerId: provider.id }))
        .revision,
      text: 'orphaned runtime',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
    })
    orphanScopes.push(orphan)
  }
  const untouched = await db.execute('chat.read', {
    projectId: p.id,
    sessionId: orphanScopes[1].sessionId,
  })
  const reconciled = await runtime.execute(
    'chat.read',
    { projectId: p.id, sessionId: orphanScopes[0].sessionId },
    () => true,
  )
  assert.equal(reconciled.turn.error.code, 'INTERRUPTED')
  assert.equal(
    (await db.execute('chat.read', { projectId: p.id, sessionId: orphanScopes[1].sessionId })).turn
      .state,
    untouched.turn.state,
  )
  assert.equal(requests, 1)
  checks.push(
    'A persisted active turn without a runtime connection is reconciled only for the requested session, with no network replay',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await runtime?.close()
  await db?.close()
  await rm(root, { recursive: true, force: true })
}
