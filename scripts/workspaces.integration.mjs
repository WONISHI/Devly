import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-worktrees-')),
  project = join(root, '真实 项目')
let db, service
const git = (args, cwd = project) =>
  execFileSync('/usr/bin/git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim()
const checks = []
try {
  await mkdir(project)
  git(['init', '-b', 'main'])
  git(['config', 'user.name', 'Local fixture'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  await writeFile(join(project, 'code.txt'), 'base\n')
  git(['add', '.'])
  git(['commit', '-m', 'base'])
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project })
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) =>
    (await service.execute({ operation, args: { projectId: p.id, ...args } }, () => true)).data
  await writeFile(join(project, 'user.txt'), 'keep user data\n')
  const a = await call('workspaces.create'),
    b = await call('workspaces.create')
  assert.notEqual(a.path, b.path)
  assert.notEqual(a.workspaceProjectId, b.workspaceProjectId)
  assert.equal(await readFile(join(a.path, 'code.txt'), 'utf8'), 'base\n')
  assert.ok(git(['worktree', 'list', '--porcelain']).includes(a.path))
  assert.equal((await db.execute('bootstrap')).activeProjectId, p.id)
  const beforeBranch = await call('workspaces.review', { workspaceId: a.id })
  git(['checkout', '-b', 'other-at-same-commit'])
  assert.equal(
    (await call('workspaces.merge', { workspaceId: a.id, token: beforeBranch.token })).code,
    'stale',
  )
  const changedBranch = await call('workspaces.review', { workspaceId: a.id })
  assert.equal(
    (await call('workspaces.merge', { workspaceId: a.id, token: changedBranch.token })).code,
    'branch_changed',
  )
  git(['checkout', 'main'])
  checks.push(
    'Two real Git worktrees have independent branch/project IDs, start at committed HEAD and preserve main uncommitted files',
  )
  await writeFile(join(a.path, 'code.txt'), 'task A\n')
  let review = await call('workspaces.review', { workspaceId: a.id })
  assert.ok(review.diff.includes('+task A'))
  assert.equal(
    (await call('workspaces.remove', { workspaceId: a.id, token: review.token })).code,
    'dirty',
  )
  await writeFile(join(a.path, 'code.txt'), 'task A updated\n')
  assert.equal(
    (await call('workspaces.commit', { workspaceId: a.id, token: review.token, message: 'task A' }))
      .code,
    'stale',
  )
  review = await call('workspaces.review', { workspaceId: a.id })
  assert.equal(
    (await call('workspaces.commit', { workspaceId: a.id, token: review.token, message: 'task A' }))
      .ok,
    true,
  )
  review = await call('workspaces.review', { workspaceId: a.id })
  assert.equal(
    (await call('workspaces.merge', { workspaceId: a.id, token: review.token })).code,
    'dirty',
  )
  assert.equal(await readFile(join(project, 'user.txt'), 'utf8'), 'keep user data\n')
  checks.push(
    'Actual diff reviews file content; stale edit rejects, dirty worktree removal and dirty main merge refuse without deleting user files',
  )
  await rm(join(project, 'user.txt'))
  review = await call('workspaces.review', { workspaceId: a.id })
  assert.equal(
    (await call('workspaces.merge', { workspaceId: a.id, token: review.token })).ok,
    true,
  )
  assert.equal(await readFile(join(project, 'code.txt'), 'utf8'), 'task A updated\n')
  await writeFile(join(b.path, 'code.txt'), 'conflicting task B\n')
  review = await call('workspaces.review', { workspaceId: b.id })
  assert.equal(
    (await call('workspaces.commit', { workspaceId: b.id, token: review.token, message: 'task B' }))
      .ok,
    true,
  )
  review = await call('workspaces.review', { workspaceId: b.id })
  assert.equal(
    (await call('workspaces.merge', { workspaceId: b.id, token: review.token })).code,
    'diverged',
  )
  assert.equal(await readFile(join(project, 'code.txt'), 'utf8'), 'task A updated\n')
  const branch = b.branch
  const recoveryName = `.devly-before-${randomUUID()}`
  await writeFile(join(b.path, recoveryName), 'original retained bytes\n')
  review = await call('workspaces.review', { workspaceId: b.id })
  assert.deepEqual(review.preservedRecoveryFiles, [recoveryName])
  assert.equal(review.dirty, false)
  assert.equal(
    (await call('workspaces.remove', { workspaceId: b.id, token: review.token })).code,
    'recovery_present',
  )
  assert.equal(await readFile(join(b.path, recoveryName), 'utf8'), 'original retained bytes\n')
  // Fixture owner explicitly removes its generated backup; product cleanup must never do this.
  await rm(join(b.path, recoveryName))
  review = await call('workspaces.review', { workspaceId: b.id })
  assert.equal(
    (await call('workspaces.remove', { workspaceId: b.id, token: review.token })).ok,
    true,
  )
  assert.ok(git(['branch', '--list', branch]).includes(branch))
  checks.push(
    'Reviewed commit and fast-forward merge succeed; conflicting diverged branches refuse without overwriting main; clean close retains task branch',
  )
  console.log(JSON.stringify({ realGit: true, checks }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
