import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-config-')),
  project = join(root, 'sensitive-project-path'),
  configFile = join(root, 'config.json'),
  diagnosticFile = join(root, 'diagnostics.json'),
  storage = join(root, 'storage'),
  SQLite = createRequire(import.meta.url)('better-sqlite3')
await mkdir(project)
let db, service
const checks = [],
  vault = {
    initialize: async () => {},
    reconcile: async () => {},
    available: () => false,
    read: async () => {
      throw new Error('Config export must not decrypt credentials')
    },
  },
  prompts = {
    credential: async () => null,
    file: async () => null,
    configExport: async (kind) => (kind === 'diagnostics' ? diagnosticFile : configFile),
    configImport: async () => configFile,
  }
try {
  db = new DatabaseClient(storage)
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'private provider metadata',
      protocol: 'responses',
      baseUrl: 'https://example.invalid/v1',
      model: 'private-model-name',
    }),
    session = await db.execute('sessions.create', { projectId: p.id }),
    ref = randomUUID()
  await db.execute('internal.credential.ref', { providerId: provider.id, ref })
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
  })
  const settings = await db.execute('settings.get', { projectId: null })
  await db.execute('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      theme: 'light',
      defaultProviderId: provider.id,
      defaultModel: provider.model,
    },
  })
  service = new LocalDataService(db, vault, prompts)
  await service.initialize()
  let call = async (operation, args = {}, owner = 'owner') =>
    (await service.execute({ operation, args }, () => true, owner)).data
  await call('config.export')
  const raw = await readFile(configFile, 'utf8'),
    config = JSON.parse(raw)
  for (const field of [ref, 'credential_ref', 'credentialRef', 'hasCredential', 'apiKey', 'report'])
    assert.ok(!raw.includes(field))
  await call('diagnostics.export')
  const diagnostic = await readFile(diagnosticFile, 'utf8')
  for (const field of [
    ref,
    project,
    provider.name,
    provider.model,
    provider.baseUrl,
    'credential_ref',
  ])
    assert.ok(!diagnostic.includes(field))
  assert.equal(JSON.parse(diagnostic).counts.sessions, 1)
  checks.push(
    'Real config export uses an explicit whitelist without decrypting Key; diagnostic contains counts/states but no paths, names, URLs, models or credential references',
  )
  let preview = await call('config.import.inspect')
  await assert.rejects(call('config.import.apply', { previewId: preview.previewId }, 'other'))
  await writeFile(configFile, raw + ' ')
  await assert.rejects(call('config.import.apply', { previewId: preview.previewId }))
  await writeFile(configFile, raw)
  const unsafe = structuredClone(config)
  unsafe.providers[0].apiKey = 'sk-fixture-secret-never-publish'
  await writeFile(configFile, JSON.stringify(unsafe))
  await assert.rejects(call('config.import.inspect'))
  assert.equal((await db.execute('providers.list')).length, 1)
  await writeFile(configFile, raw)
  checks.push(
    'Wrong owner, changed file and secret-bearing/unknown import fields reject without replacing settings or providers',
  )
  await service.close()
  await db.close()
  const sqlite = new SQLite(join(storage, 'devly.sqlite'))
  sqlite.exec(
    "CREATE TRIGGER fixture_fail_config BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT,'fixture settings failure'); END;",
  )
  sqlite.close()
  db = new DatabaseClient(storage)
  await db.ready
  service = new LocalDataService(db, vault, prompts)
  await service.initialize()
  call = async (operation, args = {}, owner = 'owner') =>
    (await service.execute({ operation, args }, () => true, owner)).data
  preview = await call('config.import.inspect')
  await assert.rejects(call('config.import.apply', { previewId: preview.previewId }))
  assert.equal((await db.execute('providers.list')).length, 1)
  await service.close()
  await db.close()
  const fixed = new SQLite(join(storage, 'devly.sqlite'))
  fixed.exec('DROP TRIGGER fixture_fail_config')
  fixed.close()
  db = new DatabaseClient(storage)
  await db.ready
  service = new LocalDataService(db, vault, prompts)
  await service.initialize()
  preview = await call('config.import.inspect')
  const imported = await call('config.import.apply', { previewId: preview.previewId })
  assert.equal(imported.imported, 1)
  const providers = await db.execute('providers.list'),
    added = providers.find((p) => p.id !== provider.id)
  assert.equal(providers.length, 2)
  assert.equal(added.hasCredential, false)
  assert.equal(providers.find((p) => p.id === provider.id).hasCredential, true)
  assert.equal(
    (await db.execute('sessions.get', { projectId: p.id, sessionId: session.id })).providerId,
    provider.id,
  )
  assert.equal((await db.execute('settings.get', { projectId: null })).defaultProviderId, added.id)
  await assert.rejects(call('config.import.apply', { previewId: preview.previewId }))
  checks.push(
    'Actual SQL failure rolls back newly inserted providers; explicit reviewed import creates fresh IDs, maps defaults, preserves old session/Key and rejects reused preview',
  )
  console.log(JSON.stringify({ fixture: true, checks }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
