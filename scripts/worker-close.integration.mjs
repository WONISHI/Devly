import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseClient } from '../out/main/data-client.js'
const root = await mkdtemp(join(tmpdir(), 'devly-worker-close-'))
let db, id
try {
  await mkdir(join(root, 'project'))
  for (let cycle = 0; cycle < 4; cycle++) {
    db = new DatabaseClient(join(root, 'storage'))
    await db.ready
    const project = await db.execute('internal.project.upsert', { path: join(root, 'project') })
    if (id) assert.equal(project.id, id)
    id = project.id
    const settings = await db.execute('settings.get', { projectId: id })
    if (cycle) assert.equal(settings.maxTokens, 1000 + cycle - 1)
    await db.execute('settings.save', {
      projectId: id,
      settings: { ...settings, maxTokens: 1000 + cycle },
    })
    await Promise.all([db.close(), db.close()])
    assert.equal(db.isAvailable(), false)
    await assert.rejects(
      db.execute('projects.list'),
      (error) => error.info.code === 'STORAGE_UNAVAILABLE',
    )
  }
  console.log(
    '4 actual SQLite Worker restarts retain data and concurrent close callers finish before process exit',
  )
} finally {
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
