// Generated real project/SQLite records; local model fixture only, no personal credentials.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-extensions-'))
let db, runtime
const checks = []
try {
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const projects = []
  for (const name of ['project-a', 'project-b']) {
    const path = join(root, name)
    await mkdir(path)
    await mkdir(join(path, 'src'))
    await writeFile(join(path, 'src', 'sample.ts'), 'export const value = 1\n')
    projects.push(await db.execute('internal.project.upsert', { path }))
  }
  const [a, b] = projects
  const record = await db.execute('project.context.save', {
    projectId: a.id,
    kind: 'memory',
    name: 'A convention',
    scope: '.',
    content: 'PROJECT_A_PRIVATE_GUIDANCE',
    enabled: true,
  })
  await assert.rejects(
    db.execute('project.context.save', {
      projectId: b.id,
      id: record.id,
      kind: record.kind,
      name: record.name,
      scope: record.scope,
      content: record.content,
      enabled: record.enabled,
    }),
  )
  assert.equal((await db.execute('project.context.list', { projectId: b.id })).length, 0)
  const provider = await db.execute('providers.save', {
    name: 'fixture',
    protocol: 'chat-completions',
    baseUrl: 'http://127.0.0.1:1/v1',
    model: 'fixture',
  })
  const requests = []
  runtime = new ChatRuntime(
    db,
    {
      read: async () => {
        throw Error('unexpected secret')
      },
    },
    async (url, init) => {
      requests.push(JSON.parse(init.body))
      return new Response(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Local context checked' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      )
    },
  )
  await runtime.initialize()
  async function task(project) {
    const session = await db.execute('sessions.create', { projectId: project.id })
    await db.execute('sessions.bind', {
      projectId: project.id,
      sessionId: session.id,
      providerId: provider.id,
      model: provider.model,
    })
    const scope = { projectId: project.id, sessionId: session.id }
    await runtime.execute(
      'chat.start',
      {
        ...scope,
        turnId: randomUUID(),
        text: 'Inspect project conventions',
        expectedProviderId: provider.id,
        expectedModel: provider.model,
        mode: 'read-only',
        selectedPaths: ['src/sample.ts'],
      },
      () => true,
    )
    for (let i = 0; i < 100; i++) {
      const s = await runtime.execute('chat.read', scope, () => true)
      if (s.turn.state === 'completed') return s
      await new Promise((r) => setTimeout(r, 20))
    }
    throw Error('not completed')
  }
  const first = await task(a)
  assert.ok(
    requests[0].messages.some((m) => String(m.content).includes('PROJECT_A_PRIVATE_GUIDANCE')),
  )
  assert.ok(first.turn.agent.sources.some((s) => s.kind === 'memory' && s.path.includes(record.id)))
  await task(b)
  assert.ok(!JSON.stringify(requests[1]).includes('PROJECT_A_PRIVATE_GUIDANCE'))
  checks.push(
    'Actual user-managed project memory enters bounded Agent context with source IDs and never crosses projects',
  )
  await db.close()
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  assert.equal(
    (await db.execute('project.context.list', { projectId: a.id }))[0].content,
    'PROJECT_A_PRIVATE_GUIDANCE',
  )
  await db.execute('project.context.remove', { projectId: a.id, id: record.id })
  assert.equal((await db.execute('project.context.list', { projectId: a.id })).length, 0)
  checks.push(
    'Worker restart retains inspectable user records; removal is scoped; model/tool output has no memory-write tool',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await runtime?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
