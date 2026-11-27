// Generated SQLite/backup fixtures only. Never uses a personal profile or provider Key.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseClient, migrations, applyMigrations } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const SQLite = createRequire(import.meta.url)('better-sqlite3')
const root = await mkdtemp(join(tmpdir(), 'devly-stability-')),
  storage = join(root, 'storage'),
  project = join(root, '项目 A'),
  backup = join(root, 'export.devly-backup')
let db, service
const passed = []
try {
  await mkdir(project)
  db = new DatabaseClient(storage)
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project })
  const session = await db.execute('sessions.create', { projectId: p.id, title: 'original' })
  const provider = await db.execute('providers.save', {
    name: 'fixture',
    protocol: 'chat-completions',
    baseUrl: 'https://example.invalid/v1',
    model: 'fixture',
  })
  await db.execute('internal.credential.ref', { providerId: provider.id, ref: randomUUID() })
  const context = await db.execute('project.context.save', {
    projectId: p.id,
    kind: 'memory',
    name: 'backup memory',
    scope: '.',
    content: 'user reviewed project convention',
    enabled: true,
  })
  const mcp = await db.execute('mcp.save', {
    projectId: p.id,
    name: 'backup MCP',
    url: 'https://fixture.invalid/mcp',
    enabled: false,
  })
  await db.execute('internal.mcp.ref', { projectId: p.id, serverId: mcp.id, ref: randomUUID() })
  const vault = { initialize: async () => {}, reconcile: async () => {}, available: () => false }
  service = new LocalDataService(db, vault, {
    credential: async () => null,
    file: async () => null,
    backup: async () => backup,
    restore: async () => backup,
  })
  await service.initialize()
  const call = async (operation, args = {}, owner = 'a') =>
    (await service.execute({ operation, args }, () => true, owner)).data
  const summary = await call('storage.backup')
  assert.equal(summary.sessions, 1)
  assert.deepEqual((await readdir(backup)).sort(), ['blobs', 'devly.sqlite', 'manifest.json'])
  const exported = new SQLite(join(backup, 'devly.sqlite'), { readonly: true })
  assert.equal(exported.prepare('SELECT credential_ref FROM providers').get().credential_ref, null)
  assert.equal(
    exported.prepare('SELECT credential_ref FROM mcp_servers').get().credential_ref,
    null,
  )
  assert.equal(exported.prepare('SELECT id FROM project_context').get().id, context.id)
  exported.close()
  assert.equal((await db.execute('providers.list'))[0].hasCredential, true)
  assert.equal((await db.execute('mcp.servers', { projectId: p.id }))[0].hasCredential, true)
  passed.push(
    'Consistent Worker snapshot excludes credentials, keeps source references and validates real SQLite',
  )
  for (const kind of ['settings', 'trigger']) {
    const damaged = join(root, `semantic-${kind}`)
    await cp(backup, damaged, { recursive: true })
    const copy = new SQLite(join(damaged, 'devly.sqlite'))
    if (kind === 'settings')
      copy
        .prepare(
          "INSERT INTO settings(scope,value) VALUES('global',?) ON CONFLICT(scope) DO UPDATE SET value=excluded.value",
        )
        .run('{"version":999}')
    else copy.exec('CREATE TRIGGER unexpected_trigger AFTER INSERT ON sessions BEGIN SELECT 1; END')
    copy.close()
    const manifest = JSON.parse(await readFile(join(damaged, 'manifest.json'), 'utf8'))
    manifest.databaseHash = createHash('sha256')
      .update(await readFile(join(damaged, 'devly.sqlite')))
      .digest('hex')
    await writeFile(join(damaged, 'manifest.json'), JSON.stringify(manifest))
    await assert.rejects(db.execute('internal.storage.inspect', { path: damaged }))
    assert.equal(
      (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
      'original',
    )
  }
  passed.push(
    'Valid file hashes do not admit invalid settings or executable SQLite triggers; active data stays intact',
  )
  const preview = await call('storage.restore.inspect')
  await assert.rejects(
    call(
      'storage.restore.stage',
      { previewId: preview.previewId, digest: preview.summary.digest },
      'other',
    ),
  )
  await db.execute('sessions.rename', {
    projectId: p.id,
    sessionId: session.id,
    title: 'after-backup',
  })
  await call('storage.restore.stage', {
    previewId: preview.previewId,
    digest: preview.summary.digest,
  })
  assert.equal((await call('storage.status')).pendingRestore, true)
  await assert.rejects(
    call('chat.start', {
      projectId: p.id,
      sessionId: session.id,
      turnId: randomUUID(),
      text: 'blocked until restart',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'chat',
      selectedPaths: [],
    }),
  )
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
    'after-backup',
  )
  await service.close()
  await db.close()
  db = new DatabaseClient(storage)
  await db.ready
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
    'original',
  )
  assert.equal((await db.execute('providers.list'))[0].hasCredential, false)
  assert.equal((await db.execute('mcp.servers', { projectId: p.id }))[0].hasCredential, false)
  assert.equal((await db.execute('project.context.list', { projectId: p.id }))[0].id, context.id)
  const old = new SQLite(join(storage, 'devly.sqlite'), { readonly: true })
  assert.equal(old.prepare('SELECT title FROM sessions').get().title, 'after-backup')
  old.close()
  passed.push(
    'Restore stages separately, rejects wrong owner, switches pointer on restart and preserves previous DB',
  )
  await writeFile(join(storage, 'pending-store.json'), JSON.stringify({ generation: randomUUID() }))
  await db.close()
  db = new DatabaseClient(storage)
  await db.ready
  assert.equal((await db.execute('storage.status')).recoveryError, true)
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
    'original',
  )
  await db.execute('storage.restore.cancel')
  const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'))
  await writeFile(
    join(backup, 'manifest.json'),
    JSON.stringify({ ...manifest, databaseHash: '0'.repeat(64) }),
  )
  await assert.rejects(db.execute('internal.storage.inspect', { path: backup }))
  passed.push(
    'Missing/corrupt staged restore and changed backup fail without overwriting the active generation',
  )
  for (const [previousVersion, broken] of [
    [7, false],
    [7, true],
    [8, false],
    [8, true],
  ]) {
    const dir = join(root, `migration-v${previousVersion}-${broken ? 'failed' : 'good'}`)
    await mkdir(dir)
    await mkdir(join(dir, 'backups'))
    const sqlite = new SQLite(join(dir, 'devly.sqlite'))
    for (const step of migrations.filter((step) => step.version <= previousVersion)) {
      sqlite.exec(step.sql)
      sqlite.pragma(`user_version=${step.version}`)
    }
    sqlite
      .prepare('INSERT INTO projects(id,path,name,last_opened_at) VALUES(?,?,?,?)')
      .run(randomUUID(), '/fixture', 'kept', 1)
    if (broken)
      sqlite.exec(
        previousVersion === 7
          ? "ALTER TABLE approvals ADD COLUMN payload TEXT NOT NULL DEFAULT '{}'"
          : 'CREATE TABLE project_context(id TEXT)',
      )
    if (broken) {
      await assert.rejects(applyMigrations(sqlite, join(dir, 'backups')))
      assert.equal(sqlite.pragma('user_version', { simple: true }), previousVersion)
    } else {
      await applyMigrations(sqlite, join(dir, 'backups'))
      assert.equal(sqlite.pragma('user_version', { simple: true }), migrations.length)
    }
    assert.equal(sqlite.prepare('SELECT name FROM projects').get().name, 'kept')
    assert.ok((await readdir(join(dir, 'backups'))).length)
    sqlite.close()
  }
  passed.push(
    'Real v7/v8→current migrations preserve rows; actual DDL failures roll back version and retain readable backups',
  )

  const turnId = randomUUID(),
    config = await db.execute('internal.provider.config', { providerId: provider.id }),
    scope = { projectId: p.id, sessionId: session.id, turnId },
    request = {
      ...scope,
      text: 'event fixture',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      providerId: provider.id,
      model: provider.model,
      revision: config.revision,
      mode: 'chat',
      selectedPaths: [],
    }
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
    allowHistory: true,
  })
  await db.execute('internal.chat.begin', request)
  assert.equal((await db.execute('internal.chat.request', request)).id, turnId)
  await assert.rejects(db.execute('internal.chat.request', { ...request, text: 'different' }))
  const update = { ...scope, text: 'kept', eventId: randomUUID() }
  await db.execute('internal.chat.update', update)
  const seq = (await db.execute('chat.read', { projectId: p.id, sessionId: session.id })).sequence
  assert.equal((await db.execute('internal.chat.update', update)).updated, false)
  assert.equal(
    (await db.execute('chat.read', { projectId: p.id, sessionId: session.id })).sequence,
    seq,
  )
  await assert.rejects(db.execute('internal.chat.update', { ...update, text: 'injected' }))
  const tool = {
    id: randomUUID(),
    callId: 'event-call',
    name: 'read_file',
    state: 'completed',
    approval: null,
    input: '{}',
    output: 'kept',
    error: null,
    execution: null,
    truncated: false,
    blobId: null,
    position: 0,
  }
  await db.execute('internal.chat.tool', { ...scope, tool })
  assert.equal(
    (
      await db.execute('internal.chat.tool', {
        ...scope,
        tool: { ...tool, state: 'running', output: 'late' },
      })
    ).updated,
    false,
  )
  await db.execute('internal.chat.update', {
    ...scope,
    state: 'completed',
    phase: 'completed',
    text: 'final',
    endedAt: Date.now(),
  })
  assert.equal(
    (await db.execute('internal.chat.update', { ...scope, text: 'late final overwrite' })).updated,
    false,
  )
  const checked = await db.execute('chat.read', { projectId: p.id, sessionId: session.id })
  assert.equal(checked.text, 'final')
  assert.equal(checked.tools[0].output, 'kept')
  passed.push(
    'Scoped event IDs are idempotent, changed replay is rejected, sequence is monotonic, terminal tool/turn records reject late overwrite',
  )
  console.log(JSON.stringify({ fixture: true, checks: passed }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
