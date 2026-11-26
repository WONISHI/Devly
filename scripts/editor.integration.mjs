// Actual filesystem/Git/SQLite/editor boundary checks; no provider API or user project.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-editor-native-'))
const path = join(root, 'project')
await mkdir(path)
const git = (...args) =>
  execFileSync('/usr/bin/git', ['-C', path, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdio: 'pipe',
  })
let database, service
const checks = []
try {
  git('init', '-q')
  await mkdir(join(path, 'src'))
  await writeFile(join(path, 'src/original.ts'), 'export const answer = 1\n')
  await writeFile(join(path, 'remove.txt'), 'original deletion\n')
  await writeFile(join(path, 'rename from.txt'), 'original rename\n')
  await writeFile(join(path, 'binary.bin'), Buffer.from([0, 1, 2]))
  git('add', '.')
  git(
    '-c',
    'user.name=Devly Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--no-verify',
    '-qm',
    'fixture baseline',
  )
  database = new DatabaseClient(join(root, 'profile'))
  await database.ready
  const project = await database.execute('internal.project.upsert', { path: await realpath(path) })
  service = new LocalDataService(
    database,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const data = async (operation, args = {}) =>
    (
      await service.execute(
        { operation, args: { projectId: project.id, ...args } },
        () => true,
        'fixture',
      )
    ).data
  const initial = await data('editor.read', { path: 'src/original.ts' })
  const saved = await data('editor.save', {
    path: 'src/original.ts',
    expectedHash: initial.version,
    content: 'export const answer = 2\n',
  })
  assert.equal(saved.saved, true)
  assert.equal(await readFile(join(path, 'src/original.ts'), 'utf8'), 'export const answer = 2\n')
  assert.equal(await readFile(join(path, saved.recoveryPath), 'utf8'), 'export const answer = 1\n')
  checks.push('Versioned editor save uses isolated helper and retains the original bytes')
  await writeFile(join(path, 'src/original.ts'), 'external edit\n')
  const conflict = await data('editor.save', {
    path: 'src/original.ts',
    expectedHash: saved.document.version,
    content: 'must not overwrite',
  })
  assert.equal(conflict.saved, false)
  assert.equal(conflict.error, 'conflict')
  assert.equal(await readFile(join(path, 'src/original.ts'), 'utf8'), 'external edit\n')
  checks.push('External edits reject stale saves without overwriting the file')
  await writeFile(join(path, 'added.txt'), 'created\n')
  await rm(join(path, 'remove.txt'))
  git('mv', 'rename from.txt', 'rename to.txt')
  await writeFile(join(path, 'binary.bin'), Buffer.from([0, 2, 3]))
  const changes = await data('editor.changes')
  assert.equal(changes.available, true)
  assert.ok(
    changes.changes.some((change) => change.path === 'added.txt' && change.kind === 'added'),
  )
  assert.ok(
    changes.changes.some((change) => change.path === 'remove.txt' && change.kind === 'deleted'),
  )
  assert.ok(
    changes.changes.some(
      (change) =>
        change.path === 'rename to.txt' &&
        change.oldPath === 'rename from.txt' &&
        change.kind === 'renamed',
    ),
  )
  assert.ok(changes.changes.every((change) => !change.path.includes('.devly-before-')))
  const modified = await data('editor.diff', { path: 'src/original.ts' })
  assert.equal(modified.original.text, 'export const answer = 1\n')
  assert.equal(modified.modified.text, 'external edit\n')
  const added = await data('editor.diff', { path: 'added.txt' })
  assert.equal(added.original.status, 'missing')
  assert.equal(added.modified.text, 'created\n')
  const deleted = await data('editor.diff', { path: 'remove.txt' })
  assert.equal(deleted.original.text, 'original deletion\n')
  assert.equal(deleted.modified.status, 'missing')
  const renamed = await data('editor.diff', { path: 'rename to.txt' })
  assert.equal(renamed.oldPath, 'rename from.txt')
  assert.equal(renamed.original.text, renamed.modified.text)
  const binary = await data('editor.diff', { path: 'binary.bin' })
  assert.equal(binary.original.status, 'binary')
  assert.equal(binary.modified.status, 'binary')
  checks.push(
    'Actual HEAD-to-worktree contents cover modified, added, deleted, staged rename and binary files',
  )
  await writeFile(join(path, '.env'), 'fixture-private')
  const denied = await data('editor.diff', { path: '.env' })
  assert.equal(denied.original.status, 'denied')
  assert.equal(denied.modified.text, null)
  const watchId = randomUUID(),
    before = await data('editor.observe', { watchId, paths: ['src'] })
  await rename(join(path, 'src'), join(path, 'moved-src'))
  await new Promise((resolve) => setTimeout(resolve, 150))
  const watched = await data('editor.observe', { watchId, paths: ['src'] })
  assert.ok(watched.revision > before.revision)
  assert.equal(watched.degraded, true)
  const missing = await data('editor.read', { path: 'src/original.ts' })
  assert.equal(missing.status, 'missing')
  service.clearOwner('fixture')
  checks.push(
    'Protected contents never enter Diff; deleted directories degrade watching without crashing',
  )
  console.log(JSON.stringify({ fixture: true, platform: process.platform, checks }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await database?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
