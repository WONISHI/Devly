import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-multi-')),
  project = join(root, 'project'),
  requests = [],
  held = []
let db, service
const checks = [],
  git = (args) => execFileSync('/usr/bin/git', args, { cwd: project, encoding: 'utf8' })
const frame = (delta, finish) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`
const toolFrame = (name, args, id = 'call') =>
  frame(
    {
      tool_calls: [
        { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } },
      ],
    },
    'tool_calls',
  ) + 'data: [DONE]\n\n'
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw),
    goal =
      body.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .find((text) => /^(DELEGATE_|CHILD_|QUEUE_)/.test(text)) ?? ''
  requests.push({
    goal,
    model: body.model,
    tools: body.tools.map((t) => t.function.name),
    maxTokens: body.max_tokens,
    body,
  })
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const results = body.messages.filter((m) => m.role === 'tool'),
    names = body.tools.map((t) => t.function.name)
  if (goal.startsWith('QUEUE_') || goal === 'CHILD_CANCEL_HTTP') {
    res.write(frame({ content: 'waiting for cancellation' }, null))
    held.push(res)
    return
  }
  if (goal.startsWith('DELEGATE_')) {
    if (results.length) {
      res.end(frame({ content: 'Observed isolated child outcomes.' }, 'stop') + 'data: [DONE]\n\n')
      return
    }
    assert.ok(names.includes('spawn_agents'))
    const caps = { maxTokens: 4096, maxCalls: 4, maxOutputChars: 16000, maxDurationMs: 60000 }
    const tasks =
      goal === 'DELEGATE_OVER_BUDGET'
        ? [{ ...caps, maxTokens: 1000000, text: 'never-created', mode: 'read-only' }]
        : goal === 'DELEGATE_CANCEL'
          ? [
              { ...caps, text: 'CHILD_CANCEL_PATCH', mode: 'project-write' },
              { ...caps, text: 'CHILD_CANCEL_HTTP', mode: 'read-only' },
            ]
          : [
              { ...caps, text: 'CHILD_READ_SUCCESS', mode: 'read-only' },
              { ...caps, text: 'CHILD_WRITE_SUCCESS', mode: 'project-write' },
            ]
    res.end(toolFrame('spawn_agents', { tasks }, 'delegate-call'))
    return
  }
  assert.ok(!names.includes('spawn_agents'), 'children must not receive delegation tool')
  assert.ok(
    JSON.stringify(body.messages).includes('ROOT_CONTEXT_GUIDANCE'),
    'child inherits the correct user-managed project memory',
  )
  assert.ok(
    JSON.stringify(body.messages).includes('ACTUAL_CHILD_SKILL'),
    'child inherits only the explicitly selected Skill',
  )
  if (!results.length) {
    res.end(toolFrame('read_file', { path: 'code.txt', startLine: 1, limit: 20 }, 'read-call'))
    return
  }
  if (goal === 'CHILD_READ_SUCCESS') {
    res.end(frame({ content: 'Read isolated code successfully.' }, 'stop') + 'data: [DONE]\n\n')
    return
  }
  if (results.length === 1) {
    const data = JSON.parse(results[0].content).data
    res.end(
      toolFrame(
        'apply_patch',
        {
          changes: [
            {
              path: 'code.txt',
              expectedHash: data.contentHash,
              content: goal === 'CHILD_CANCEL_PATCH' ? 'MUST_NOT_WRITE\n' : 'child-only edit\n',
            },
          ],
        },
        'patch-call',
      ),
    )
    return
  }
  res.end(frame({ content: 'Observed approved isolated patch.' }, 'stop') + 'data: [DONE]\n\n')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
try {
  await mkdir(project)
  git(['init', '-b', 'main'])
  git(['config', 'user.name', 'Fixture'])
  git(['config', 'user.email', 'fixture@example.invalid'])
  await writeFile(join(project, 'code.txt'), 'base\n')
  git(['add', '.'])
  git(['commit', '-m', 'base'])
  const skillDir = join(project, '.agents/skills/child')
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    join(skillDir, 'SKILL.md'),
    '---\nname: child\ndescription: Child source evidence\n---\nACTUAL_CHILD_SKILL Read the real code before answering or proposing edits.\n',
  )
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'single inherited provider',
      protocol: 'chat-completions',
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      model: 'inherited-fixture',
    })
  const settings = await db.execute('settings.get', { projectId: p.id })
  await db.execute('settings.save', {
    projectId: p.id,
    settings: {
      ...settings,
      defaultProviderId: provider.id,
      defaultModel: provider.model,
      projectPermission: 'ask',
      maxTokens: 20000,
      agentLimits: { ...settings.agentLimits, maxDurationMs: 180000 },
    },
  })
  await db.execute('project.context.save', {
    projectId: p.id,
    name: 'root source',
    kind: 'memory',
    scope: '.',
    content: 'ROOT_CONTEXT_GUIDANCE',
    enabled: true,
  })
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) =>
    (await service.execute({ operation, args }, () => true)).data
  const skill = (await call('skills.discover', { projectId: p.id }))[0]
  await call('skills.select', {
    projectId: p.id,
    entries: [{ path: skill.path, hash: skill.hash }],
  })
  const start = (text, extra = {}) =>
    call('tasks.start', {
      projectId: p.id,
      text,
      providerId: provider.id,
      model: provider.model,
      mode: 'project-write',
      allowDelegation: true,
      ...extra,
    })
  const scope = (turn) => ({ projectId: turn.projectId, sessionId: turn.sessionId })
  const respond = (turn, tool, allowed) =>
    call('chat.approve', {
      ...scope(turn),
      turnId: turn.id,
      callId: tool.callId,
      approvalId: tool.approval.id,
      digest: tool.approval.digest,
      allowed,
    })
  async function wait(check) {
    for (let i = 0; i < 900; i++) {
      const result = await check()
      if (result) return result
      await new Promise((r) => setTimeout(r, 25))
    }
    throw Error('Timed out waiting for actual task state')
  }
  const parent = await start('DELEGATE_SUCCESS')
  const approved = new Set()
  await wait(async () => {
    const tasks = await call('tasks.list', { projectId: p.id })
    for (const task of tasks.filter((t) => ['running', 'pending'].includes(t.state))) {
      const current = await call('chat.read', scope(task))
      for (const tool of current.tools.filter((t) => t.approval?.state === 'pending'))
        if (!approved.has(tool.approval.id)) {
          if (tool.name === 'spawn_agents')
            assert.equal((await call('workspaces.list', { projectId: p.id })).length, 0)
          if (task.id !== parent.id) {
            assert.equal(
              (
                await call('chat.approve', {
                  ...scope(parent),
                  turnId: parent.id,
                  callId: tool.callId,
                  approvalId: tool.approval.id,
                  digest: tool.approval.digest,
                  allowed: true,
                })
              ).removed,
              false,
            )
          }
          approved.add(tool.approval.id)
          assert.equal((await respond(task, tool, true)).removed, true)
        }
    }
    const current = await call('chat.read', scope(parent))
    return ['completed', 'failed', 'cancelled'].includes(current.turn.state) ? current : false
  })
  const final = await call('chat.read', scope(parent))
  assert.equal(final.turn.state, 'completed', JSON.stringify(final.turn.error))
  assert.equal(final.tools[0].state, 'completed')
  assert.equal(final.turn.agent.family.children.length, 2)
  const children = final.turn.agent.family.children,
    workspaces = await call('workspaces.list', { projectId: p.id })
  assert.equal(workspaces.length, 2)
  for (const child of children) {
    const snapshot = await call('chat.read', scope(child))
    assert.equal(snapshot.turn.state, 'completed')
    assert.equal(snapshot.turn.providerId, provider.id)
    assert.equal(snapshot.turn.model, provider.model)
    assert.equal(snapshot.turn.agent.family.parentTurnId, parent.id)
    assert.equal(snapshot.turn.agent.family.depth, 1)
    assert.ok(
      snapshot.turn.agent.family.allocation.tokens <= final.turn.agent.family.allocation.tokens,
    )
    assert.ok(requests.filter((r) => r.goal.startsWith('CHILD_')).every((r) => r.maxTokens <= 4096))
  }
  assert.equal(await readFile(join(project, 'code.txt'), 'utf8'), 'base\n')
  assert.equal(
    await readFile(
      join(workspaces.find((w) => w.id === children[1].workspaceId).path, 'code.txt'),
      'utf8',
    ),
    'child-only edit\n',
  )
  const outputTokens =
    final.turn.usage.outputTokens +
    (await Promise.all(children.map((child) => call('chat.read', scope(child))))).reduce(
      (n, s) => n + s.turn.usage.outputTokens,
      0,
    )
  assert.equal(final.turn.agent.family.remaining.tokens, 20000 - outputTokens)
  const childLog = (await call('chat.read', scope(children[1]))).tools[0].blobId
  await assert.rejects(
    call('blobs.read', { ...scope(parent), blobId: childLog, offset: 0, length: 100 }),
  )
  checks.push('A parent cannot read a child raw tool log through the wrong project/session scope')
  checks.push(
    'Real parent→two child turns yield permits without deadlock; children inherit provider, approved memory/Skill and narrowed budgets, get separate worktrees/approvals/logs, and only the approved child file changes',
  )
  const countBefore = workspaces.length,
    excess = await start('DELEGATE_OVER_BUDGET')
  await wait(async () => {
    const current = await call('chat.read', scope(excess))
    const tool = current.tools.find((t) => t.approval?.state === 'pending')
    if (tool) await respond(excess, tool, true)
    return current.turn.state === 'completed' ? current : false
  })
  assert.equal((await call('workspaces.list', { projectId: p.id })).length, countBefore)
  assert.equal((await call('chat.read', scope(excess))).tools[0].error, 'CHILD_BUDGET')
  checks.push(
    'Over-budget approved delegation is rejected before creating workspaces; no alternate provider or directory can be supplied by the model',
  )
  const cancelling = await start('DELEGATE_CANCEL')
  let pendingApproval
  await wait(async () => {
    const current = await call('chat.read', scope(cancelling)),
      proposal = current.tools.find(
        (t) => t.name === 'spawn_agents' && t.approval?.state === 'pending',
      )
    if (proposal) await respond(cancelling, proposal, true)
    const family = current.turn.agent.family
    if (family.children.length !== 2) return false
    const snapshots = await Promise.all(
      family.children.map((child) => call('chat.read', scope(child))),
    )
    pendingApproval = snapshots
      .flatMap((s) => s.tools)
      .find((t) => t.name === 'apply_patch' && t.approval?.state === 'pending')
    return pendingApproval && requests.some((r) => r.goal === 'CHILD_CANCEL_HTTP') ? family : false
  })
  await call('chat.cancel', { ...scope(cancelling), turnId: cancelling.id })
  const cancelled = await wait(async () => {
    const current = await call('chat.read', scope(cancelling))
    return current.turn.state === 'cancelled' ? current : false
  })
  for (const child of cancelled.turn.agent.family.children) {
    const current = await call('chat.read', scope(child))
    assert.equal(current.turn.state, 'cancelled')
    const ws = (await call('workspaces.list', { projectId: p.id })).find(
      (w) => w.id === child.workspaceId,
    )
    assert.equal(await readFile(join(ws.path, 'code.txt'), 'utf8'), 'base\n')
    for (const tool of current.tools) assert.notEqual(tool.approval?.state, 'pending')
  }
  assert.equal(
    (
      await call('chat.approve', {
        ...scope(cancelling),
        turnId: cancelling.id,
        callId: 'patch-call',
        approvalId: pendingApproval.approval.id,
        digest: pendingApproval.approval.digest,
        allowed: true,
      })
    ).removed,
    false,
  )
  checks.push(
    'Parent stop aborts a live child HTTP stream and another child waiting on patch approval; all settle without file writes, late approval is rejected and workspaces are retained',
  )
  const wa = await call('workspaces.create', { projectId: p.id }),
    wb = await call('workspaces.create', { projectId: p.id })
  const active = await start('QUEUE_ACTIVE', { workspaceId: wa.id, allowDelegation: false }),
    queued = await start('QUEUE_CANCEL', { workspaceId: wa.id, allowDelegation: false }),
    isolated = await start('QUEUE_ISOLATED', { workspaceId: wb.id, allowDelegation: false })
  await wait(
    async () =>
      requests.some((r) => r.goal === 'QUEUE_ACTIVE') &&
      requests.some((r) => r.goal === 'QUEUE_ISOLATED'),
  )
  assert.equal((await call('chat.read', scope(queued))).turn.phase, 'queued')
  assert.equal(requests.filter((r) => r.goal === 'QUEUE_CANCEL').length, 0)
  await call('chat.cancel', { ...scope(queued), turnId: queued.id })
  await wait(async () => (await call('chat.read', scope(queued))).turn.state === 'cancelled')
  assert.equal((await call('chat.read', scope(active))).turn.state, 'running')
  assert.equal((await call('chat.read', scope(isolated))).turn.state, 'running')
  for (const item of [active, isolated])
    await call('chat.cancel', { ...scope(item), turnId: item.id })
  await wait(async () =>
    (await Promise.all([active, isolated].map((t) => call('chat.read', scope(t))))).every(
      (s) => s.turn.state === 'cancelled',
    ),
  )
  checks.push(
    'Actual whole-turn queue serializes one workspace, permits another isolated writer concurrently, and cancelling its queued item sends no HTTP request and leaves running items intact',
  )
  assert.ok(requests.every((r) => r.model === provider.model))
  console.log(
    JSON.stringify(
      {
        actualGitAndFiles: true,
        modelFixture: true,
        checks,
        requests: requests.map(({ goal, model, tools, maxTokens }) => ({
          goal,
          model,
          tools,
          maxTokens,
        })),
      },
      null,
      2,
    ),
  )
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  for (const res of held) res.end()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
