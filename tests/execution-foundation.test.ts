import { randomUUID } from 'node:crypto'
import { validatePlan } from '../src/main/agent/plan'
import { agentToolSchema } from '../src/shared/agent-contracts'
import { ReadOnlyToolbox } from '../src/main/agent/tools'
import { serializeMutation } from '../src/main/agent/execution-tools'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { applyProjectPatch, contentHash } from '../src/main/agent/patch-executor'
import { captureGitBaseline, compareGitBaselines } from '../src/main/agent/git-baseline'
import { ApprovalBroker } from '../src/main/agent/approval-broker'
import { commandRequest, commandProfile } from '../src/main/agent/command-executor'
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devly-execution-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})
const signal = () => new AbortController().signal
const scope = { projectId: 'project', sessionId: 'session', turnId: 'turn', callId: 'call' }

it('records non-Git projects without creating a repository', async () => {
  expect(await captureGitBaseline(root)).toMatchObject({ available: false, root: null })
})
it.skipIf(process.platform !== 'darwin' || process.env.DEVLY_VERIFY_HOST_EXECUTION !== '1')(
  'captures an unborn repo and preserves pre-existing dirt without claiming agent attribution',
  async () => {
    execFileSync(process.platform === 'win32' ? 'git' : '/usr/bin/git', ['init', '-q', root])
    await writeFile(join(root, 'user.txt'), 'existing user edit')
    const before = await captureGitBaseline(root)
    await writeFile(join(root, 'agent.txt'), 'new observation')
    const after = await captureGitBaseline(root)
    expect(before).toMatchObject({ available: true, head: null, entries: ['?? user.txt'] })
    expect(compareGitBaselines(before, after)).toMatchObject({
      comparable: true,
      attribution: 'observed-only',
      before: ['?? user.txt'],
      addedOrChanged: ['?? agent.txt'],
    })
  },
)
it('applies each file independently and reports external edits as conflicts', async () => {
  await writeFile(join(root, 'a.txt'), 'user edit')
  const results = await applyProjectPatch(
    root,
    {
      changes: [
        { path: 'a.txt', expectedHash: contentHash('old'), content: 'overwrite' },
        { path: 'new.txt', expectedHash: null, content: 'created' },
      ],
    },
    signal(),
  )
  expect(results.map((item) => item.state)).toEqual(['conflict', 'applied'])
  expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('user edit')
  expect(await readFile(join(root, 'new.txt'), 'utf8')).toBe('created')
})
it('serializes simultaneous sessions writing the same original version', async () => {
  await writeFile(join(root, 'same.txt'), 'before')
  const apply = (content: string) =>
    applyProjectPatch(
      root,
      { changes: [{ path: 'same.txt', expectedHash: contentHash('before'), content }] },
      signal(),
    )
  const results = await Promise.all([apply('one'), apply('two')])
  expect(
    results
      .flat()
      .map((item) => item.state)
      .sort(),
  ).toEqual(['applied', 'conflict'])
  const winner = results.findIndex((items) => items[0].state === 'applied')
  expect(await readFile(join(root, 'same.txt'), 'utf8')).toBe(['one', 'two'][winner])
})
it('denies traversal, symlinks, secret files and existing files claimed as new', async () => {
  await mkdir(join(root, 'folder'))
  await symlink(join(root, 'folder'), join(root, 'alias'))
  await writeFile(join(root, 'existing'), 'preserved')
  for (const path of ['../escape', '/tmp/escape', '.env', '.git/config', 'alias/new']) {
    const result = await applyProjectPatch(
      root,
      { changes: [{ path, expectedHash: null, content: 'bad' }] },
      signal(),
    )
    expect(result[0].state).toBe('failed')
  }
  expect(
    (
      await applyProjectPatch(
        root,
        { changes: [{ path: 'existing', expectedHash: null, content: 'bad' }] },
        signal(),
      )
    )[0].state,
  ).toBe('conflict')
})
it('honors cancellation without publishing a file', async () => {
  const controller = new AbortController()
  controller.abort()
  expect(
    (
      await applyProjectPatch(
        root,
        { changes: [{ path: 'never', expectedHash: null, content: 'bad' }] },
        controller.signal,
      )
    )[0].state,
  ).toBe('cancelled')
  await expect(readFile(join(root, 'never'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('requires matching scope and digest, and consumes approvals once', async () => {
  const broker = new ApprovalBroker()
  const { request, decision } = broker.request(
    scope,
    'apply_patch',
    { content: 'exact proposal' },
    signal(),
  )
  expect(broker.respond({ ...scope, turnId: 'wrong' }, request.id, request.digest, true)).toBe(
    false,
  )
  expect(broker.respond(scope, request.id, 'changed', true)).toBe(false)
  expect(broker.respond(scope, request.id, request.digest, false)).toBe(true)
  expect(await decision).toBe(false)
  expect(broker.respond(scope, request.id, request.digest, true)).toBe(false)
})
it('expires, cancels and closes pending approvals without granting access', async () => {
  const broker = new ApprovalBroker()
  const expired = broker.request(scope, 'run_command', {}, signal(), 10)
  expect(await expired.decision).toBe(false)
  expect(broker.respond(scope, expired.request.id, expired.request.digest, true)).toBe(false)
  const controller = new AbortController()
  const cancelled = broker.request(scope, 'apply_patch', {}, controller.signal)
  controller.abort()
  expect(await cancelled.decision).toBe(false)
  const closed = broker.request(scope, 'run_command', {}, signal())
  broker.close()
  expect(await closed.decision).toBe(false)
})
it('rejects unbounded command arguments and emits a project-scoped deny-default profile', () => {
  expect(commandRequest.safeParse({ command: 'echo ok', timeoutMs: 0 }).success).toBe(false)
  expect(
    commandRequest.safeParse({ command: 'echo ok', env: { API_KEY: 'forbidden' } }).success,
  ).toBe(false)
  expect(commandProfile(root)).toContain('(deny default)')
  expect(commandProfile(root)).not.toContain('(allow network')
})

it('preserves a recoverable original inode after replacing an existing file', async () => {
  await writeFile(join(root, 'original.txt'), 'user bytes')
  const [result] = await applyProjectPatch(
    root,
    {
      changes: [
        { path: 'original.txt', expectedHash: contentHash('user bytes'), content: 'agent bytes' },
      ],
    },
    signal(),
  )
  expect(result.state).toBe('applied')
  expect(result.recoveryPath).toMatch(/\.devly-before-/)
  expect(await readFile(join(root, result.recoveryPath!), 'utf8')).toBe('user bytes')
  expect(await readFile(join(root, 'original.txt'), 'utf8')).toBe('agent bytes')
})
it('cancels queued mutations without executing them or releasing the active project lock', async () => {
  let release!: () => void
  const blocker = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered = false
  const first = serializeMutation(root, signal(), async () => {
    entered = true
    await blocker
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(entered).toBe(true)
  const controller = new AbortController()
  let ran = false
  const second = serializeMutation(root, controller.signal, async () => {
    ran = true
  })
  const rejection = expect(second).rejects.toThrow('CANCELLED')
  controller.abort()
  await rejection
  const third = serializeMutation(join(root, 'nested-project'), signal(), async () => {
    ran = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(ran).toBe(false)
  release()
  await Promise.all([first, third])
  expect(ran).toBe(true)
})

it('requires actual successful tool references before accepting a completed plan step', () => {
  const record = agentToolSchema.parse({
    id: randomUUID(),
    callId: 'read-proof',
    name: 'read_file',
    state: 'completed',
    input: '{}',
    output: '{}',
    error: null,
    truncated: false,
    blobId: null,
    position: 0,
  })
  const plan = JSON.stringify({
    steps: [
      { id: 'inspect', title: 'Inspect project', state: 'completed', callIds: ['read-proof'] },
    ],
  })
  expect(validatePlan(plan, [record], '')[0].state).toBe('completed')
  expect(() => validatePlan(plan, [{ ...record, state: 'failed' }], '')).toThrow(
    'PLAN_EVIDENCE_REQUIRED',
  )
  expect(() => validatePlan(plan, [], '')).toThrow('PLAN_EVIDENCE_REQUIRED')
  expect(() => validatePlan('{', [], '')).toThrow('INVALID_JSON')
  expect(() =>
    validatePlan(
      JSON.stringify({ steps: [{ id: 'a', title: 'Do work', state: 'completed', callIds: [] }] }),
      [],
      '',
    ),
  ).toThrow('PLAN_EVIDENCE_REQUIRED')
})

it('uses the actual UTF-8 BOM bytes for read_file versions and subsequent writes', async () => {
  const bytes = Buffer.from('\ufeff中文\r\noriginal\r\n')
  await writeFile(join(root, 'bom.txt'), bytes)
  const tools = await ReadOnlyToolbox.create(root, signal())
  const version = await tools.read('bom.txt')
  expect(version.contentHash).toBe(contentHash(bytes))
  const [result] = await applyProjectPatch(
    root,
    {
      changes: [
        {
          path: 'bom.txt',
          expectedHash: version.contentHash,
          content: '\ufeff中文\r\nchanged\r\n',
        },
      ],
    },
    signal(),
  )
  expect(result.state).toBe('applied')
  expect(await readFile(join(root, result.recoveryPath!))).toEqual(bytes)
})
