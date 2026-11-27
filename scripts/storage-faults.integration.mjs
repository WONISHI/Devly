import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rename, unlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseClient } from '../out/main/data-client.js'
const SQLite = createRequire(import.meta.url)('better-sqlite3'),
  root = await mkdtemp(join(tmpdir(), 'devly-storage-faults-')),
  project = join(root, 'project'),
  storage = join(root, 'storage')
await mkdir(project)
let db
const checks = []
try {
  db = new DatabaseClient(storage)
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'fixture',
      protocol: 'chat-completions',
      baseUrl: 'https://example.invalid/v1',
      model: 'fixture',
    }),
    session = await db.execute('sessions.create', { projectId: p.id })
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
  })
  const config = await db.execute('internal.provider.config', { providerId: provider.id }),
    scope = { projectId: p.id, sessionId: session.id, turnId: randomUUID() }
  await db.execute('internal.chat.begin', {
    ...scope,
    providerId: provider.id,
    model: provider.model,
    revision: config.revision,
    text: 'must survive',
    expectedProviderId: provider.id,
    expectedModel: provider.model,
  })
  await db.execute('internal.chat.update', { ...scope, text: 'original result' })
  await db.close()
  const sqlite = new SQLite(join(storage, 'devly.sqlite'))
  sqlite.exec(
    "CREATE TRIGGER fixture_fail_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'fixture storage write failure'); END;",
  )
  sqlite.close()
  db = new DatabaseClient(storage)
  await db.ready
  await assert.rejects(db.execute('internal.chat.update', { ...scope, text: 'must roll back' }))
  assert.equal(
    (await db.execute('chat.read', { projectId: p.id, sessionId: session.id })).text,
    'original result',
  )
  await db.close()
  const fixed = new SQLite(join(storage, 'devly.sqlite'))
  fixed.exec('DROP TRIGGER fixture_fail_event')
  fixed.close()
  db = new DatabaseClient(storage)
  await db.ready
  await db.execute('internal.chat.update', { ...scope, text: 'retry only after explicit fix' })
  checks.push(
    'Actual SQLite event-insert failure rolls back message mutation; removing fault permits an explicit later update',
  )
  const block = join(root, 'blocked-parent')
  await writeFile(block, 'not a directory')
  await assert.rejects(
    db.execute('internal.storage.backup', { path: join(block, 'backup.devly-backup') }),
  )
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
    'must survive',
  )
  checks.push('Actual ENOTDIR during backup preserves live project/session database')
  const blobs = join(storage, 'blobs'),
    held = join(storage, 'held-blobs')
  await rename(blobs, held)
  await writeFile(blobs, 'blocked')
  try {
    await assert.rejects(
      db.execute('internal.agent.log', { ...scope, name: 'fixture', output: 'bounded log' }),
    )
    assert.equal(
      (await db.execute('blobs.list', { projectId: p.id, sessionId: session.id })).items.length,
      0,
    )
  } finally {
    await unlink(blobs)
    await rename(held, blobs)
  }
  await db.execute('internal.agent.log', { ...scope, name: 'fixture', output: 'bounded log' })
  assert.equal(
    (await db.execute('blobs.list', { projectId: p.id, sessionId: session.id })).items.length,
    1,
  )
  checks.push(
    'Actual blob write failure creates no dangling index; explicit retry after repair succeeds',
  )
  await db.worker.terminate()
  await assert.rejects(db.execute('sessions.get', { projectId: p.id, sessionId: session.id }))
  assert.equal(db.isAvailable(), false)
  await db.close().catch(() => {})
  db = new DatabaseClient(storage)
  await db.ready
  assert.equal(
    (await db.execute('chat.read', { projectId: p.id, sessionId: session.id })).text,
    'retry only after explicit fix',
  )
  await db.execute('internal.chat.recover', {})
  assert.equal(
    (await db.execute('chat.read', { projectId: p.id, sessionId: session.id })).turn.error.code,
    'INTERRUPTED',
  )
  checks.push(
    'Actual Worker termination rejects requests without replay; WAL records survive reopening and old active turn is interrupted',
  )
  await db.close()
  await writeFile(join(storage, 'active-store.json'), '{broken pointer')
  db = new DatabaseClient(storage)
  await db.ready
  assert.equal((await db.execute('storage.status')).recoveryError, true)
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).title,
    'must survive',
  )
  assert.match(await readFile(join(storage, 'active-store.json'), 'utf8'), /broken/)
  checks.push(
    'Corrupt generation pointer uses retained original data with explicit recovery warning, never silently creates an empty replacement',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
