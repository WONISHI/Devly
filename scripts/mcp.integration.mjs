import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
import { startMcpFixture } from './mcp-server-fixture.mjs'
const root = await mkdtemp(join(tmpdir(), 'devly-mcp-')),
  project = join(root, 'project'),
  audit = join(root, 'service-audit.txt'),
  secret = `sk-mcp-${randomUUID()}`
let db, service, fixture
let releaseSlow
const slow = new Promise((resolve) => {
    releaseSlow = resolve
  }),
  checks = [],
  secrets = new Map()
try {
  await mkdir(project)
  await writeFile(join(project, 'source.txt'), 'controlled project\n')
  const frame = (delta, finish) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
  fixture = await startMcpFixture({
    token: secret,
    onEcho: async (message) => {
      if (message === 'cancel-after-dispatch') await slow
      else await writeFile(audit, message)
    },
    model: async (req, res, body) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      const user = body.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
        result = body.messages.find((m) => m.role === 'tool')
      if (result) {
        res.end(frame({ content: 'Observed the actual tool result.' }, 'stop') + 'data: [DONE]\n\n')
        return
      }
      const tools = body.tools.map((t) => t.function),
        tool = tools.find(
          (t) =>
            t.name.startsWith('mcp_') &&
            t.description.includes(user.includes('server failure') ? 'failure' : 'Echo'),
        )
      assert.ok(tool, 'MCP tool must be registered')
      const args = user.includes('invalid args')
        ? { message: 42 }
        : user.includes('server failure')
          ? {}
          : {
              message: user.includes('cancel dispatched')
                ? 'cancel-after-dispatch'
                : 'approved-local-call',
            }
      res.end(
        frame(
          {
            tool_calls: [
              {
                index: 0,
                id: 'actual-mcp-call',
                type: 'function',
                function: { name: tool.name, arguments: JSON.stringify(args) },
              },
            ],
          },
          'tool_calls',
        ) + 'data: [DONE]\n\n',
      )
    },
  })
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'local model fixture',
      protocol: 'chat-completions',
      baseUrl: fixture.modelUrl,
      model: 'fixture',
    })
  const settings = await db.execute('settings.get', { projectId: p.id })
  await db.execute('settings.save', {
    projectId: p.id,
    settings: { ...settings, projectPermission: 'ask' },
  })
  service = new LocalDataService(
    db,
    {
      initialize: async () => {},
      reconcile: async () => {},
      available: () => true,
      put: async (value) => {
        const id = randomUUID()
        secrets.set(id, value)
        return id
      },
      read: async (id) => secrets.get(id),
      remove: async (id) => secrets.delete(id),
    },
    { credential: async () => secret, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) =>
    (await service.execute({ operation, args }, () => true)).data
  const config = await call('mcp.save', {
    projectId: p.id,
    name: 'Actual local MCP',
    url: fixture.url,
    enabled: true,
  })
  await call('mcp.credentials.set', { projectId: p.id, serverId: config.id })
  const test = await call('mcp.connect', { projectId: p.id, serverId: config.id })
  assert.equal(test.state, 'checked')
  assert.equal(test.tools.length, 2)
  assert.ok(!JSON.stringify(test).includes(secret))
  assert.equal(fixture.calls.length, 0)
  const other = await call('mcp.save', {
    projectId: p.id,
    name: 'Second identity',
    url: fixture.url,
    enabled: false,
  })
  await call('mcp.credentials.set', { projectId: p.id, serverId: other.id })
  const otherTest = await call('mcp.connect', { projectId: p.id, serverId: other.id })
  assert.notEqual(test.tools[0].alias, otherTest.tools[0].alias)
  const bad = await call('mcp.save', {
    projectId: p.id,
    name: 'Missing service',
    url: fixture.url + '/missing',
    enabled: false,
  })
  assert.equal((await call('mcp.connect', { projectId: p.id, serverId: bad.id })).state, 'failed')
  checks.push(
    'Official SDK client connects to an actual official SDK MCP HTTP server, discovers distinct aliases and reports a real connection failure without exposing credentials',
  )
  for (const [text, allowed, expectedCalls] of [
    ['denied call', false, 0],
    ['approved call', true, 1],
    ['invalid args', null, 1],
    ['server failure', true, 2],
  ]) {
    const session = await db.execute('sessions.create', { projectId: p.id })
    await db.execute('sessions.bind', {
      projectId: p.id,
      sessionId: session.id,
      providerId: provider.id,
      model: provider.model,
    })
    const scope = { projectId: p.id, sessionId: session.id },
      turnId = randomUUID()
    await call('chat.start', {
      ...scope,
      turnId,
      text,
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'project-write',
      selectedPaths: [],
    })
    let last
    for (let i = 0; i < 400; i++) {
      last = await call('chat.read', scope)
      const tool = last.tools.find((t) => t.state === 'waiting_approval')
      if (tool) {
        assert.equal(tool.origin.serverId, config.id)
        assert.equal(fixture.calls.length, expectedCalls - (allowed ? 1 : 0))
        const response = {
          ...scope,
          turnId,
          callId: tool.callId,
          approvalId: tool.approval.id,
          digest: tool.approval.digest,
          allowed: !!allowed,
        }
        assert.equal((await call('chat.approve', response)).removed, true)
        assert.equal((await call('chat.approve', response)).removed, false)
      }
      if (['completed', 'failed', 'cancelled'].includes(last.turn.state)) break
      await new Promise((r) => setTimeout(r, 25))
    }
    assert.equal(last.turn.state, 'completed', JSON.stringify(last.turn.error))
    assert.equal(fixture.calls.length, expectedCalls)
    assert.ok(!JSON.stringify(last).includes(secret))
    if (text === 'invalid args') assert.equal(last.tools[0].error, 'INVALID_ARGUMENTS')
    if (text === 'server failure') assert.equal(last.tools[0].state, 'failed')
  }
  assert.equal(await readFile(audit, 'utf8'), 'approved-local-call')
  checks.push(
    'No server side effect before exact approval; denial returns to the model, a single approved call writes actual audit data, duplicate approval cannot dispatch twice',
  )
  checks.push(
    'Worker validates invalid JSON-schema arguments before approval; a real server tool exception is recorded as failed; stored/public tool results redact the generated Key',
  )
  const cancelSession = await db.execute('sessions.create', { projectId: p.id })
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: cancelSession.id,
    providerId: provider.id,
    model: provider.model,
  })
  const cancelScope = { projectId: p.id, sessionId: cancelSession.id },
    cancelId = randomUUID()
  await call('chat.start', {
    ...cancelScope,
    turnId: cancelId,
    text: 'cancel dispatched external operation',
    expectedProviderId: provider.id,
    expectedModel: provider.model,
    mode: 'project-write',
    selectedPaths: [],
  })
  let pending
  for (let i = 0; i < 400; i++) {
    pending = await call('chat.read', cancelScope)
    if (pending.tools[0]?.state === 'waiting_approval') break
    await new Promise((r) => setTimeout(r, 25))
  }
  const approval = pending.tools[0].approval
  const answer = {
    ...cancelScope,
    turnId: cancelId,
    callId: pending.tools[0].callId,
    approvalId: approval.id,
    digest: approval.digest,
    allowed: true,
  }
  await call('chat.approve', answer)
  for (let i = 0; i < 400 && fixture.calls.length < 3; i++)
    await new Promise((r) => setTimeout(r, 25))
  assert.equal(fixture.calls.length, 3)
  await call('chat.cancel', { ...cancelScope, turnId: cancelId })
  let stopped
  for (let i = 0; i < 400; i++) {
    stopped = await call('chat.read', cancelScope)
    if (!['running', 'pending'].includes(stopped.turn.state)) break
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.equal(stopped.turn.error?.code, 'EXECUTION_STATE_UNKNOWN')
  assert.equal((await call('chat.approve', answer)).removed, false)
  releaseSlow()
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(
    fixture.calls.length,
    3,
    'cancel must never replay an externally dispatched operation',
  )
  checks.push(
    'Cancelling an actual in-flight MCP call records unknown external outcome, revokes old approval and never replays the side effect',
  )
  console.log(JSON.stringify({ actualMcpService: true, modelFixture: true, checks }, null, 2))
} finally {
  releaseSlow?.()
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  await fixture?.close()
  await rm(root, { recursive: true, force: true })
}
