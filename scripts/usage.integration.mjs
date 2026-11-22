import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { DatabaseClient } from '../out/main/data-client.js'
const SQLite = createRequire(import.meta.url)('better-sqlite3')

export async function verifyUsage(root, projectPath) {
  const storage = join(root, 'usage-storage')
  let client = new DatabaseClient(storage)
  let inspect
  try {
    await client.ready
    const project = await client.execute('internal.project.upsert', { path: projectPath })
    const a = await client.execute('providers.save', {
      name: 'Usage A',
      protocol: 'chat-completions',
      baseUrl: 'https://example.invalid/v1',
      model: 'test',
    })
    const b = await client.execute('providers.save', {
      name: 'Usage B',
      protocol: 'chat-completions',
      baseUrl: 'https://example.invalid/v1',
      model: 'test',
    })
    const session = await client.execute('sessions.create', { projectId: project.id })
    inspect = new SQLite(join(storage, 'devly.sqlite'))
    const insert = inspect.prepare(
      'INSERT INTO turns(id,session_id,project_id,status,provider_id,started_at,usage) VALUES(?,?,?,?,?,?,?)',
    )
    const put = (provider, status, usage, started = 1) =>
      insert.run(
        randomUUID(),
        session.id,
        project.id,
        status,
        provider.id,
        started,
        usage === null ? null : JSON.stringify(usage),
      )
    put(a, 'completed', { inputTokens: 10, outputTokens: 20, totalTokens: 30 })
    put(a, 'failed', { inputTokens: 5, outputTokens: null, totalTokens: null })
    put(a, 'cancelled', null)
    put(b, 'completed', { inputTokens: 100, outputTokens: 200, totalTokens: 300 })
    const summary = () => client.execute('usage.summary', { providerId: a.id })
    let result = await summary()
    assert.equal(result.lifetime.turns, 3)
    assert.deepEqual(result.lifetime.input, { tokens: 15, reportedTurns: 2 })
    assert.deepEqual(result.lifetime.total, { tokens: 30, reportedTurns: 1 })
    assert.equal(
      (await client.execute('usage.summary', { providerId: b.id })).lifetime.total.tokens,
      300,
    )
    await client.execute('usage.budget.save', { providerId: a.id, budgetTokens: 100 })
    await assert.rejects(
      client.execute('usage.budget.save', { providerId: a.id, budgetTokens: -1 }),
    )
    assert.equal((await summary()).budgetTokens, 100)
    await client.close()
    client = new DatabaseClient(storage)
    await client.ready
    assert.equal((await summary()).budgetTokens, 100)
    assert.equal((await summary()).period.total.tokens, 30)
    const reset = await client.execute('usage.budget.save', {
      providerId: a.id,
      budgetTokens: 200,
      reset: true,
    })
    assert.ok(reset.since > 1)
    assert.equal(reset.period.turns, 0)
    put(a, 'completed', { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, reset.since + 1)
    result = await summary()
    assert.equal(result.period.turns, 1)
    assert.equal(result.period.total.reportedTurns, 1)
    assert.equal(result.lifetime.turns, 4)
    await client.execute('usage.budget.save', { providerId: a.id, budgetTokens: null })
    assert.equal((await summary()).since, reset.since)
    assert.equal((await summary()).budgetTokens, null)
    put(a, 'running', null, reset.since + 2)
    assert.equal((await summary()).activeTurns, 1)
    assert.equal((await summary()).lifetime.turns, 4)
    await client.execute('providers.remove', { providerId: a.id })
    assert.equal(inspect.prepare('SELECT COUNT(*) AS n FROM provider_usage_budgets').get().n, 0)
    assert.equal(
      inspect.prepare('SELECT COUNT(*) AS n FROM turns WHERE provider_id=?').get(a.id).n,
      5,
    )
  } finally {
    inspect?.close()
    await client.close()
  }
}
