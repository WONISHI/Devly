// Actual local Git + SQLite, generated repositories only. No provider API.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const temporary = await mkdtemp(join(tmpdir(), 'devly-git-')),
  project = join(temporary, '中文 空格项目'),
  plain = join(temporary, 'plain')
await mkdir(project)
await mkdir(plain)
const git = (...args) =>
  execFileSync('/usr/bin/git', ['-C', project, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    encoding: 'utf8',
  })
let db, service
const checks = []
try {
  git('init', '-q')
  git('config', 'user.name', 'Fixture Author')
  git('config', 'user.email', 'fixture@example.invalid')
  db = new DatabaseClient(join(temporary, 'profile'))
  await db.ready
  const record = await db.execute('internal.project.upsert', { path: await realpath(project) }),
    nonGit = await db.execute('internal.project.upsert', { path: await realpath(plain) })
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) =>
    (
      await service.execute(
        { operation, args: { projectId: record.id, ...args } },
        () => true,
        'fixture',
      )
    ).data
  const snapshot = () => call('git.snapshot')
  assert.equal((await call('git.snapshot', { projectId: nonGit.id })).reason, 'non_git')
  assert.equal((await snapshot()).available, true)
  assert.equal((await call('git.history')).commits.length, 0)
  await writeFile(join(project, '中文 文件.txt'), 'original\n')
  let before = await snapshot()
  const stagedResult = await call('git.stage', {
    paths: ['中文 文件.txt'],
    staged: true,
    token: before.token,
  })
  assert.equal(stagedResult.ok, true, JSON.stringify({ before, stagedResult }))
  before = await snapshot()
  assert.deepEqual(before.staged, ['中文 文件.txt'])
  assert.equal(
    (await call('git.stage', { paths: ['中文 文件.txt'], staged: false, token: before.token })).ok,
    true,
  )
  assert.equal(await readFile(join(project, '中文 文件.txt'), 'utf8'), 'original\n')
  before = await snapshot()
  await call('git.stage', { paths: ['中文 文件.txt'], staged: true, token: before.token })
  before = await snapshot()
  const initial = await call('git.commit', {
    token: before.token,
    message: 'Initial real commit',
    author: 'Fixture Author',
    email: 'fixture@example.invalid',
  })
  assert.equal(initial.ok, true)
  const history = await call('git.history')
  assert.equal(history.commits[0].hash, git('rev-parse', 'HEAD').trim())
  assert.equal(history.commits[0].author, 'Fixture Author')
  const details = await call('git.details', { hash: initial.hash })
  assert.equal(details.files[0].path, '中文 文件.txt')
  assert.equal(details.files[0].additions, 1)
  checks.push(
    'Empty/non-Git repositories, Chinese/space paths, actual author/hash/root commit details and unborn unstage',
  )
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'create', name: 'fixture-branch' }))
      .ok,
    true,
  )
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'switch', name: 'missing-branch' }))
      .code,
    'failed',
  )
  assert.equal((await snapshot()).branch, 'fixture-branch')
  await writeFile(join(project, '中文 文件.txt'), 'local change\n')
  before = await snapshot()
  assert.equal(
    (
      await call('git.branch', {
        token: before.token,
        action: 'switch',
        name:
          history.commits[0].branch ||
          git('for-each-ref', '--format=%(refname:short)', 'refs/heads/')
            .trim()
            .split('\n')
            .find((x) => x !== 'fixture-branch'),
      })
    ).code,
    'dirty',
  )
  assert.equal(await readFile(join(project, '中文 文件.txt'), 'utf8'), 'local change\n')
  await call('git.stage', { token: before.token, paths: ['中文 文件.txt'], staged: true })
  assert.equal(
    (
      await call('git.commit', {
        token: before.token,
        message: 'must refuse stale review',
        author: 'Fixture Author',
        email: 'fixture@example.invalid',
      })
    ).code,
    'stale',
  )
  before = await snapshot()
  assert.equal(
    (await call('git.stage', { token: before.token, paths: ['../outside'], staged: true })).code,
    'denied',
  )
  await writeFile(join(project, '.env'), 'PRIVATE_FIXTURE_VALUE')
  git('add', '-f', '.env')
  before = await snapshot()
  assert.equal(
    (
      await call('git.commit', {
        token: before.token,
        message: 'must refuse protected index',
        author: 'Fixture Author',
        email: 'fixture@example.invalid',
      })
    ).code,
    'denied',
  )
  git('reset', '-q', 'HEAD', '--', '.env')
  await rm(join(project, '.env'))
  before = await snapshot()
  await call('git.stage', { token: before.token, paths: ['中文 文件.txt'], staged: false })
  assert.equal(await readFile(join(project, '中文 文件.txt'), 'utf8'), 'local change\n')
  checks.push(
    'Safe create/switch failure and dirty protection, stale index review, protected staged paths and traversal rejection',
  )
  // The prior assertion deliberately preserved a dirty file; restore this generated fixture first.
  await writeFile(join(project, '中文 文件.txt'), 'original\n')
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'create', name: 'delete-me' })).ok,
    true,
  )
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'switch', name: 'fixture-branch' }))
      .ok,
    true,
  )
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'delete', name: 'delete-me' })).ok,
    true,
  )
  const separate = git(
    'commit-tree',
    `${initial.hash}^{tree}`,
    '-p',
    initial.hash,
    '-m',
    'unmerged fixture',
  ).trim()
  git('branch', 'unmerged-fixture', separate)
  before = await snapshot()
  assert.equal(
    (await call('git.branch', { token: before.token, action: 'delete', name: 'unmerged-fixture' }))
      .ok,
    false,
  )
  assert.ok(git('show-ref', '--verify', 'refs/heads/unmerged-fixture').includes(separate))
  checks.push('Real merged branch deletion succeeds; non-forced unmerged deletion is refused')
  // Fixture-only preparation: create actual index conflict and verify no write API resolves it implicitly.
  git('checkout', '--', '中文 文件.txt')
  const base = git('hash-object', '中文 文件.txt').trim()
  const one = execFileSync('/usr/bin/git', ['-C', project, 'hash-object', '-w', '--stdin'], {
      input: 'ours\n',
      encoding: 'utf8',
    }).trim(),
    two = execFileSync('/usr/bin/git', ['-C', project, 'hash-object', '-w', '--stdin'], {
      input: 'theirs\n',
      encoding: 'utf8',
    }).trim()
  git('update-index', '--force-remove', '中文 文件.txt')
  execFileSync('/usr/bin/git', ['-C', project, 'update-index', '--index-info'], {
    input: `100644 ${base} 1\t中文 文件.txt\n100644 ${one} 2\t中文 文件.txt\n100644 ${two} 3\t中文 文件.txt\n`,
    encoding: 'utf8',
  })
  before = await snapshot()
  assert.equal(before.conflicts, true)
  assert.equal(
    (
      await call('git.commit', {
        token: before.token,
        message: 'conflict must remain',
        author: 'Fixture Author',
        email: 'fixture@example.invalid',
      })
    ).code,
    'conflict',
  )
  assert.ok(git('ls-files', '-u').length > 0)
  checks.push('Actual unmerged index is reported; commit rejects and preserves the conflict')
  // Build actual history objects without discarding or resolving the conflict fixture.
  let parent = initial.hash
  for (let i = 0; i < 31; i++) {
    const blob = execFileSync('/usr/bin/git', ['-C', project, 'hash-object', '-w', '--stdin'], {
      input: `history ${i}\n`,
      encoding: 'utf8',
    }).trim()
    const tree = execFileSync('/usr/bin/git', ['-C', project, 'mktree'], {
      input: `100644 blob ${blob}\thistory.txt\n`,
      encoding: 'utf8',
    }).trim()
    parent = git('commit-tree', tree, '-p', parent, '-m', `History page ${i}`).trim()
  }
  git('update-ref', 'refs/heads/history-fixture', parent)
  git('symbolic-ref', 'HEAD', 'refs/heads/history-fixture')
  const firstPage = await call('git.history'),
    secondPage = await call('git.history', { before: firstPage.next })
  assert.equal(firstPage.commits.length, 30)
  assert.equal(secondPage.commits.length, 2)
  assert.equal(new Set([...firstPage.commits, ...secondPage.commits].map((c) => c.hash)).size, 32)
  checks.push('Actual first-parent commit history paginates without duplicate or missing hashes')
  const layout = {
    version: 1,
    sidebar: 270,
    editor: 52,
    tree: 30,
    terminal: 29,
    showEditor: true,
    showTerminal: true,
  }
  await call('layout.save', { layout })
  await assert.rejects(call('layout.save', { layout: { ...layout, sidebar: 0 } }))
  assert.deepEqual(await call('layout.get'), layout)
  assert.equal((await call('layout.get', { projectId: nonGit.id })).sidebar, 232)
  await service.close()
  await db.close()
  db = new DatabaseClient(join(temporary, 'profile'))
  await db.ready
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  assert.deepEqual(await call('layout.get'), layout)
  checks.push(
    'Validated per-project layout survives SQLite Worker restart; invalid layout does not overwrite it',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await service?.close()
  await db?.close()
  await rm(temporary, { recursive: true, force: true })
}
