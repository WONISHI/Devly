import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-web-')),
  secret = `sk-search-${randomUUID()}`,
  requests = [],
  keys = new Map(),
  checks = [],
  closed = []
let db, service
const frame = (delta, finish) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/search?')) {
    const u = new URL(req.url, 'http://127.0.0.1'),
      query = u.searchParams.get('q')
    assert.equal(req.headers.authorization, `Bearer ${secret}`)
    requests.push(query)
    if (query.startsWith('hold-')) {
      res.on('close', () => closed.push(query))
      return
    }
    const code = query === 'unauthorized' ? 401 : query === 'limited' ? 429 : 200
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify(
        code === 200
          ? {
              results: [
                {
                  title: 'Actual fixture source',
                  url: 'https://example.com/',
                  excerpt: `Returned for ${query}; ${secret}`,
                },
              ],
            }
          : { error: secret },
      ),
    )
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw),
    goal = body.messages
      .filter((m) => m.role === 'user')
      .find((m) => String(m.content).startsWith('WEB_'))?.content,
    results = body.messages.filter((m) => m.role === 'tool')
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  assert.ok(body.tools.some((t) => t.function.name === 'web_search'))
  if (results.length) {
    res.end(
      frame({ content: 'Observed actual source or actual refusal.' }, 'stop') + 'data: [DONE]\n\n',
    )
    return
  }
  const name = goal === 'WEB_PRIVATE' ? 'fetch_url' : 'web_search',
    args =
      name === 'fetch_url'
        ? { url: 'https://127.0.0.1/secret' }
        : goal === 'WEB_INVALID'
          ? { query: 42 }
          : { query: 'approved query', count: 2 }
  res.end(
    frame(
      {
        tool_calls: [
          {
            index: 0,
            id: 'web-call',
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
      'tool_calls',
    ) + 'data: [DONE]\n\n',
  )
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const endpoint = `http://127.0.0.1:${server.address().port}`
try {
  await mkdir(join(root, 'project'))
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: join(root, 'project') }),
    other = await db.execute('internal.project.upsert', { path: root })
  service = new LocalDataService(
    db,
    {
      initialize: async () => {},
      reconcile: async () => {},
      available: () => true,
      put: async (key) => {
        const id = randomUUID()
        keys.set(id, key)
        return id
      },
      read: async (id) => keys.get(id),
      remove: async (id) => keys.delete(id),
    },
    { credential: async () => secret, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) => {
    try {
      return (await service.execute({ operation, args }, () => true)).data
    } catch (error) {
      error.message = `${operation}: ${error.message}`
      throw error
    }
  }
  const configuration = {
    projectId: p.id,
    fetchEnabled: true,
    searchEnabled: true,
    searchProtocol: 'json',
    searchUrl: endpoint + '/search',
  }
  await call('web.save', configuration)
  await call('web.credentials.set', { projectId: p.id })
  const result = await call('web.test', { projectId: p.id, query: 'fixed query' })
  assert.equal(result.sources[0].url, 'https://example.com/')
  assert.ok(result.sources[0].retrievedAt > 0)
  assert.ok(!JSON.stringify(result).includes(secret))
  assert.equal((await call('web.get', { projectId: other.id })).searchEnabled, false)
  assert.equal((await call('web.get', { projectId: p.id })).hasCredential, true)
  assert.ok(!JSON.stringify(await call('web.get', { projectId: p.id })).includes(secret))
  for (const [query, code] of [
    ['unauthorized', 'WEB_AUTHENTICATION'],
    ['limited', 'WEB_RATE_LIMITED'],
  ])
    await assert.rejects(
      call('web.test', { projectId: p.id, query }),
      (error) => error.info.message.includes(code) && !error.info.message.includes(secret),
    )
  checks.push(
    'Actual local HTTP JSON search returns bounded source URLs/excerpts/time; independent protected reference and project isolation; 401/429 show distinct non-secret errors',
  )
  const provider = await call('providers.save', {
    name: 'local model fixture',
    protocol: 'chat-completions',
    baseUrl: endpoint,
    model: 'web-fixture',
  })
  async function start(goal) {
    const session = await call('sessions.create', { projectId: p.id })
    await call('sessions.bind', {
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
      text: goal,
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'read-only',
      selectedPaths: [],
    })
    return { ...scope, turnId }
  }
  async function wait(work) {
    for (let i = 0; i < 400; i++) {
      const result = await work()
      if (result) return result
      await new Promise((r) => setTimeout(r, 20))
    }
    throw Error('Web runtime timeout')
  }
  for (const [goal, answer, error] of [
    ['WEB_DENIED', false, 'APPROVAL_DENIED'],
    ['WEB_SUCCESS', true, null],
    ['WEB_PRIVATE', true, 'WEB_ADDRESS_DENIED'],
    ['WEB_INVALID', null, 'INVALID_ARGUMENTS'],
    ['WEB_CHANGED', true, 'PERMISSION_DENIED'],
  ]) {
    const scope = await start(goal),
      before = requests.length
    let response
    if (answer !== null) {
      const snapshot = await wait(async () => {
        const s = await call('chat.read', {
          projectId: scope.projectId,
          sessionId: scope.sessionId,
        })
        return s.tools[0]?.state === 'waiting_approval' ? s : false
      })
      assert.equal(requests.length, before)
      const t = snapshot.tools[0]
      response = {
        ...scope,
        callId: t.callId,
        approvalId: t.approval.id,
        digest: t.approval.digest,
        allowed: answer,
      }
      if (goal === 'WEB_CHANGED') await call('web.save', configuration)
      assert.equal((await call('chat.approve', response)).removed, true)
    }
    const final = await wait(async () => {
      const s = await call('chat.read', { projectId: scope.projectId, sessionId: scope.sessionId })
      return s.turn.state === 'completed' ? s : false
    })
    assert.equal(final.tools[0].error, error)
    assert.equal(requests.length, before + (goal === 'WEB_SUCCESS' ? 1 : 0))
    if (response) assert.equal((await call('chat.approve', response)).removed, false)
    if (goal === 'WEB_SUCCESS') {
      const value = JSON.parse(final.tools[0].output)
      assert.equal(value.data.sources[0].title, 'Actual fixture source')
    }
    assert.ok(!JSON.stringify(final).includes(secret))
  }
  checks.push(
    'Real Agent loop requires exact approval before HTTP; denied/invalid/private-address/stale-revision calls make no request; actual sources persist and duplicate approvals cannot dispatch twice',
  )
  const heldA = service
    .execute(
      { operation: 'web.test', args: { projectId: p.id, query: 'hold-a' } },
      () => true,
      'owner-a',
    )
    .then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    )
  const heldB = service
    .execute(
      { operation: 'web.test', args: { projectId: p.id, query: 'hold-b' } },
      () => true,
      'owner-b',
    )
    .then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    )
  for (let i = 0; i < 200 && requests.filter((q) => q.startsWith('hold-')).length < 2; i++)
    await new Promise((r) => setTimeout(r, 20))
  assert.equal(requests.filter((q) => q.startsWith('hold-')).length, 2)
  service.clearOwner('owner-a')
  assert.equal((await heldA).ok, false)
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(!closed.includes('hold-b'))
  await call('web.save', { ...configuration, searchEnabled: false })
  const revoked = await heldB
  assert.equal(revoked.ok, false)
  assert.ok(revoked.error.info.message.includes('PERMISSION_DENIED'))
  for (let i = 0; i < 100 && closed.length < 2; i++) await new Promise((r) => setTimeout(r, 20))
  assert.ok(closed.includes('hold-a') && closed.includes('hold-b'))
  assert.equal(requests.filter((q) => q.startsWith('hold-')).length, 2)
  checks.push(
    'Actual in-flight search requests have independent UI owners; owner release aborts only its request, configuration revocation closes the other connection without automatic retry',
  )
  await service.close()
  await db.close()
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  assert.equal((await db.execute('web.get', { projectId: p.id })).hasCredential, true)
  for (const file of await readdir(join(root, 'storage/blobs')))
    assert.ok(!(await readFile(join(root, 'storage/blobs', file))).includes(Buffer.from(secret)))
  checks.push(
    'Restart retains independent configuration/reference and actual tool logs contain no generated search Key; no external supplier is claimed',
  )
  console.log(JSON.stringify({ realLocalSearchService: true, modelFixture: true, checks }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
