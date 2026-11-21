import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  rm,
  readFile,
  readdir,
  writeFile,
  open,
  stat,
  symlink,
  rename,
  unlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { createRequire } from 'node:module'
import { DatabaseClient, migrations } from '../out/main/data-client.js'
import { CredentialVault } from '../out/main/vault.js'
import { LocalDataService } from '../out/main/data-service.js'
const require = createRequire(import.meta.url),
  SQLite = require('better-sqlite3')
const root = await mkdtemp(join(tmpdir(), 'devly-data-'))
let client
const passed = []
async function rejects(operation, code) {
  await assert.rejects(operation, (error) => error.info?.code === code)
}
try {
  const storage = join(root, 'storage'),
    projectA = join(root, '项目 A with spaces'),
    projectB = join(root, '项目 B')
  await mkdir(projectA)
  await mkdir(projectB)
  client = new DatabaseClient(storage)
  assert.ok((await client.ready) > 0)
  const a = await client.execute('internal.project.upsert', { path: projectA }),
    b = await client.execute('internal.project.upsert', { path: projectB })
  assert.equal((await client.execute('internal.project.upsert', { path: projectA })).id, a.id)
  assert.equal((await client.execute('projects.list')).length, 2)
  const settings = {
    version: 1,
    theme: 'light',
    defaultProviderId: null,
    defaultModel: 'model-A',
    projectPermission: 'ask',
    maxTokens: 4000,
    maxCost: 2,
  }
  await client.execute('settings.save', { projectId: a.id, settings })
  await client.execute('settings.save', {
    projectId: b.id,
    settings: { ...settings, theme: 'dark', defaultModel: 'model-B' },
  })
  await assert.rejects(
    client.execute('settings.save', { projectId: a.id, settings: { ...settings, maxCost: -1 } }),
  )
  assert.equal((await client.execute('settings.get', { projectId: a.id })).maxCost, 2)
  passed.push(
    'worker runs outside main thread; canonical multi-project records and validated settings',
  )
  const sessions = []
  let ticks = 0
  const heartbeat = setInterval(() => ticks++, 1)
  for (let index = 0; index < 65; index++)
    sessions.push(
      await client.execute('sessions.create', { projectId: a.id, title: `会话 ${index}` }),
    )
  clearInterval(heartbeat)
  assert.ok(ticks > 0)
  let cursor = null
  const ids = []
  do {
    const page = await client.execute('sessions.list', {
      projectId: a.id,
      archived: false,
      limit: 11,
      cursor,
    })
    ids.push(...page.items.map((item) => item.id))
    cursor = page.nextCursor
  } while (cursor)
  assert.equal(ids.length, 65)
  assert.equal(new Set(ids).size, 65)
  const session = sessions[0],
    other = await client.execute('sessions.create', { projectId: b.id, title: 'B-only' })
  await rejects(
    client.execute('sessions.get', { projectId: b.id, sessionId: session.id }),
    'NOT_FOUND',
  )
  await rejects(
    client.execute('sessions.rename', { projectId: b.id, sessionId: session.id, title: 'cross' }),
    'NOT_FOUND',
  )
  await client.execute('sessions.rename', {
    projectId: a.id,
    sessionId: session.id,
    title: '恢复后的名称',
  })
  await client.execute('sessions.select', { projectId: a.id, sessionId: session.id })
  for (let index = 0; index < 9; index++)
    await client.execute('internal.records.append', {
      projectId: a.id,
      sessionId: session.id,
      text: `part ${index}`,
    })
  const messages = await client.execute('sessions.messages', {
    projectId: a.id,
    sessionId: session.id,
    limit: 4,
  })
  assert.equal(messages.items.length, 4)
  assert.ok(messages.nextCursor)
  assert.equal(messages.items[0].parts.length, 1)
  await client.execute('projects.switch', { projectId: a.id })
  await client.close()
  client = new DatabaseClient(storage)
  await client.ready
  const restored = await client.execute('bootstrap')
  assert.equal(restored.activeProjectId, a.id)
  assert.equal(restored.activeSessionId, session.id)
  assert.equal(
    (await client.execute('sessions.get', { projectId: a.id, sessionId: session.id })).title,
    '恢复后的名称',
  )
  assert.equal((await client.execute('settings.get', { projectId: a.id })).defaultModel, 'model-A')
  assert.equal((await client.execute('settings.get', { projectId: b.id })).defaultModel, 'model-B')
  await client.execute('sessions.archive', {
    projectId: a.id,
    sessionId: session.id,
    archived: true,
  })
  assert.equal(
    (await client.execute('sessions.list', { projectId: a.id, archived: true })).items.length,
    1,
  )
  assert.equal((await client.execute('bootstrap')).activeSessionId, null)
  await client.execute('sessions.archive', {
    projectId: a.id,
    sessionId: session.id,
    archived: false,
  })
  passed.push(
    'restart persistence, project-scoped settings/session selection, archive/restore and keyset pagination',
  )
  const file = join(root, 'large log.txt')
  await writeFile(file, '测试输出\n'.repeat(350000))
  const blob = await client.execute('internal.blob.put', {
    projectId: a.id,
    sessionId: session.id,
    kind: 'log',
    sourcePath: file,
  })
  assert.ok(blob.bytes > 3 * 1024 * 1024)
  const slice = await client.execute('blobs.read', {
    projectId: a.id,
    sessionId: session.id,
    blobId: blob.id,
    offset: 0,
    length: 1024,
  })
  assert.equal(Buffer.from(slice.base64, 'base64').length, 1024)
  assert.equal(slice.truncated, true)
  assert.equal(slice.total, blob.bytes)
  await rejects(
    client.execute('blobs.read', { projectId: b.id, sessionId: session.id, blobId: blob.id }),
    'NOT_FOUND',
  )
  if (process.platform !== 'win32') {
    const stored = join(storage, 'blobs', `${blob.id}.bin`),
      backup = join(storage, 'blobs', `${blob.id}.safe`)
    await rename(stored, backup)
    await symlink(file, stored)
    await rejects(
      client.execute('blobs.read', { projectId: a.id, sessionId: session.id, blobId: blob.id }),
      'FORBIDDEN',
    )
    await unlink(stored)
    await rename(backup, stored)
  }
  const sparse = await open(join(root, 'too-large.bin'), 'w')
  await sparse.truncate(65 * 1024 * 1024)
  await sparse.close()
  await rejects(
    client.execute('internal.blob.put', {
      projectId: a.id,
      sessionId: session.id,
      kind: 'attachment',
      sourcePath: join(root, 'too-large.bin'),
    }),
    'LIMIT_EXCEEDED',
  )
  const inspect = new SQLite(join(storage, 'devly.sqlite'))
  inspect.pragma('foreign_keys = ON')
  const turn = randomUUID()
  inspect
    .prepare('INSERT INTO turns(id,session_id,project_id,status) VALUES(?,?,?,?)')
    .run(turn, session.id, a.id, 'pending')
  assert.throws(
    () =>
      inspect
        .prepare('INSERT INTO turns(id,session_id,project_id,status) VALUES(?,?,?,?)')
        .run(randomUUID(), session.id, b.id, 'completed'),
    /FOREIGN KEY/,
  )
  assert.throws(
    () =>
      inspect
        .prepare('INSERT INTO turns(id,session_id,project_id,status) VALUES(?,?,?,?)')
        .run(randomUUID(), session.id, a.id, 'pending'),
    /UNIQUE/,
  )
  assert.throws(
    () =>
      inspect
        .prepare('INSERT INTO messages(id,session_id,turn_id,role,created_at) VALUES(?,?,?,?,?)')
        .run(randomUUID(), other.id, turn, 'assistant', Date.now()),
    /FOREIGN KEY/,
  )
  assert.throws(
    () =>
      inspect
        .prepare('INSERT INTO tool_calls(id,turn_id,session_id,name,state) VALUES(?,?,?,?,?)')
        .run(randomUUID(), turn, other.id, 'read', 'pending'),
    /FOREIGN KEY/,
  )
  const callId = randomUUID()
  inspect
    .prepare('INSERT INTO tool_calls(id,turn_id,session_id,name,state) VALUES(?,?,?,?,?)')
    .run(callId, turn, session.id, 'read', 'pending')
  assert.throws(
    () =>
      inspect
        .prepare('INSERT INTO approvals(id,tool_call_id,session_id,state) VALUES(?,?,?,?)')
        .run(randomUUID(), callId, other.id, 'pending'),
    /FOREIGN KEY/,
  )
  assert.throws(
    () =>
      inspect
        .prepare(
          'INSERT INTO events(id,session_id,turn_id,sequence,type,summary,created_at) VALUES(?,?,?,?,?,?,?)',
        )
        .run(randomUUID(), other.id, turn, 1, 'test', '', Date.now()),
    /FOREIGN KEY/,
  )
  inspect.close()
  assert.equal(
    (
      await client.execute('blobs.prune', {
        projectId: a.id,
        sessionId: session.id,
        before: Date.now() + 100,
      })
    ).removed,
    1,
  )
  assert.equal(
    (await client.execute('blobs.list', { projectId: a.id, sessionId: session.id })).items.length,
    0,
  )
  assert.equal((await readdir(join(storage, 'blobs'))).length, 0)
  await writeFile(join(storage, 'blobs', `${randomUUID()}.tmp`), 'orphan')
  passed.push(
    'composite ownership constraints for turns/messages/tools/approvals/events; streamed large log, bounded reads, quota and retention',
  )
  const provider = await client.execute('providers.save', {
    name: 'Fixture provider',
    protocol: 'chat-completions',
    baseUrl: 'https://example.invalid/v1',
    model: 'fixture',
  })
  const encryptionKey = randomBytes(32)
  const encryption = {
    available: () => true,
    encrypt: (value) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()])
    },
    decrypt: (value) => {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey, value.subarray(0, 12))
      decipher.setAuthTag(value.subarray(-16))
      return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString(
        'utf8',
      )
    },
  }
  const vault = new CredentialVault(join(storage, 'credentials'), encryption)
  let secret = 'devly-fixture-secret-' + randomUUID()
  const oldSecret = secret
  const service = new LocalDataService(client, vault, {
    credential: async () => secret,
    file: async () => null,
  })
  await service.initialize()
  const active = () => true
  const set = () =>
    service.execute({ operation: 'credentials.set', args: { providerId: provider.id } }, active)
  assert.equal((await set()).data.saved, true)
  const firstRef = await client.execute('internal.credential.ref', { providerId: provider.id })
  assert.equal(await vault.read(firstRef), secret)
  const beforeReplace = await client.execute('internal.provider.config', {
    providerId: provider.id,
  })
  const diagnosticReport = {
    checks: [{ kind: 'text', ok: true, checkedAt: Date.now(), error: null, usage: null }],
  }
  assert.equal(
    (
      await client.execute('internal.provider.report', {
        providerId: provider.id,
        revision: beforeReplace.revision,
        report: diagnosticReport,
      })
    ).saved,
    true,
  )
  secret = 'replacement-' + randomUUID()
  await set()
  const afterReplace = await client.execute('internal.provider.config', { providerId: provider.id })
  assert.equal(afterReplace.report, null)
  assert.ok(afterReplace.revision > beforeReplace.revision)
  assert.equal(
    (
      await client.execute('internal.provider.report', {
        providerId: provider.id,
        revision: beforeReplace.revision,
        report: diagnosticReport,
      })
    ).saved,
    false,
  )
  assert.equal((await readdir(join(storage, 'credentials'))).length, 1)
  const secondRef = await client.execute('internal.credential.ref', { providerId: provider.id })
  assert.notEqual(firstRef, secondRef)
  assert.equal(await vault.read(secondRef), secret)
  const dto = await service.execute({ operation: 'providers.list', args: {} }, active)
  assert.equal(dto.data[0].hasCredential, true)
  assert.ok(!JSON.stringify(dto).includes(secret))
  assert.ok(!JSON.stringify(dto).includes(secondRef))
  for (const file of await readdir(storage)) {
    if (/sqlite/.test(file))
      for (const plain of [secret, oldSecret])
        assert.equal((await readFile(join(storage, file))).includes(Buffer.from(plain)), false)
  }
  assert.equal(
    (await readFile(join(storage, 'credentials', `${secondRef}.key`))).includes(
      Buffer.from(secret),
    ),
    false,
  )
  assert.equal(
    (
      await service.execute(
        { operation: 'credentials.clear', args: { providerId: provider.id } },
        active,
      )
    ).data.removed,
    true,
  )
  assert.equal((await readdir(join(storage, 'credentials'))).length, 0)
  const revision = (await client.execute('providers.list'))[0].revision
  const edited = await service.execute(
    {
      operation: 'providers.save',
      args: {
        id: provider.id,
        name: 'Edited fixture',
        protocol: 'chat-completions',
        baseUrl: 'https://example.invalid/v1',
        model: 'new-model',
        compatibility: {
          tokenParameter: 'max_completion_tokens',
          streamUsage: true,
          tools: 'disabled',
          vision: 'unsupported',
          contextWindow: 32000,
        },
      },
    },
    active,
  )
  assert.ok(edited.data.revision > revision)
  assert.equal(edited.data.report, null)
  assert.equal(edited.data.compatibility.contextWindow, 32000)
  const unavailable = new CredentialVault(join(storage, 'credentials'), {
    ...encryption,
    available: () => false,
  })
  await rejects(unavailable.put(secret), 'CREDENTIAL_UNAVAILABLE')
  assert.equal((await readdir(join(storage, 'credentials'))).length, 0)
  passed.push(
    'credential set/replace/clear, reference-only database, redacted DTO, atomic encrypted files and fail-closed unavailable provider (injected AES engine)',
  )
  await client.execute('projects.remove', { projectId: b.id })
  assert.ok((await stat(projectB)).isDirectory())
  assert.equal((await client.execute('projects.list')).length, 1)
  assert.equal((await client.execute('internal.project.upsert', { path: projectB })).id, b.id)
  await rm(projectB, { recursive: true })
  await rejects(client.execute('projects.switch', { projectId: b.id }), 'PROJECT_UNAVAILABLE')
  assert.equal(
    (await service.execute({ operation: 'projects.list', args: {} }, active)).data.find(
      (item) => item.id === b.id,
    ).available,
    false,
  )
  await client.close()
  client = new DatabaseClient(storage)
  await client.ready
  assert.equal((await readdir(join(storage, 'blobs'))).length, 0)
  passed.push(
    'project removal preserves directory/history, missing path handling, orphan blob recovery',
  )
  const failRoot = join(root, 'migration-failure')
  await mkdir(failRoot)
  let old = new SQLite(join(failRoot, 'devly.sqlite'))
  old.exec(migrations[0].sql)
  old.pragma('user_version = 1')
  const oldId = randomUUID()
  old
    .prepare('INSERT INTO projects(id,path,name,last_opened_at) VALUES(?,?,?,?)')
    .run(oldId, projectA, 'preserved', 1)
  old.exec('CREATE TABLE events(conflict INTEGER)')
  old.close()
  const failed = new DatabaseClient(failRoot)
  await rejects(failed.ready, 'STORAGE_UNAVAILABLE')
  await failed.close()
  old = new SQLite(join(failRoot, 'devly.sqlite'))
  assert.equal(old.pragma('user_version', { simple: true }), 1)
  assert.equal(old.prepare('SELECT name FROM projects WHERE id=?').get(oldId).name, 'preserved')
  assert.equal(old.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get(), undefined)
  old.exec('DROP TABLE events')
  old.close()
  assert.equal((await readdir(join(failRoot, 'backups'))).length, 1)
  const repaired = new DatabaseClient(failRoot)
  await repaired.ready
  assert.equal((await repaired.execute('projects.list'))[0].name, 'preserved')
  await repaired.close()
  passed.push(
    'migration failure rolls back DDL/version with old rows and pre-migration backup intact; retry upgrades successfully',
  )
  const v2Root = join(root, 'migration-v2-v3')
  await mkdir(v2Root)
  let v2 = new SQLite(join(v2Root, 'devly.sqlite'))
  v2.exec(migrations[0].sql)
  v2.exec(migrations[1].sql)
  v2.pragma('user_version = 2')
  const legacyProvider = randomUUID(),
    legacyRef = randomUUID()
  v2.prepare(
    'INSERT INTO providers(id,name,protocol,base_url,model,credential_ref) VALUES(?,?,?,?,?,?)',
  ).run(
    legacyProvider,
    'v2 provider',
    'chat-completions',
    'https://example.invalid/v1',
    'v2-model',
    legacyRef,
  )
  // Force the second ALTER to fail. The first ALTER must roll back as well.
  v2.exec('ALTER TABLE providers ADD COLUMN revision INTEGER')
  v2.close()
  const conflict = new DatabaseClient(v2Root)
  await rejects(conflict.ready, 'STORAGE_UNAVAILABLE')
  await conflict.close()
  v2 = new SQLite(join(v2Root, 'devly.sqlite'))
  assert.equal(v2.pragma('user_version', { simple: true }), 2)
  assert.equal(
    v2
      .prepare('PRAGMA table_info(providers)')
      .all()
      .some((column) => column.name === 'compatibility'),
    false,
  )
  assert.equal(
    v2.prepare('SELECT credential_ref FROM providers WHERE id=?').get(legacyProvider)
      .credential_ref,
    legacyRef,
  )
  v2.exec('ALTER TABLE providers DROP COLUMN revision')
  v2.close()
  const upgraded = new DatabaseClient(v2Root)
  await upgraded.ready
  const migrated = (await upgraded.execute('providers.list'))[0]
  assert.equal(migrated.model, 'v2-model')
  assert.equal(migrated.hasCredential, true)
  assert.equal(migrated.report, null)
  assert.equal(migrated.compatibility.vision, 'unknown')
  assert.equal((await upgraded.execute('internal.status')).schemaVersion, migrations.length)
  assert.equal(
    await upgraded.execute('internal.credential.ref', { providerId: legacyProvider }),
    legacyRef,
  )
  await upgraded.close()
  passed.push(
    'v2 → v3 preserves provider and credential references; transactional ALTER rollback/backup; compatibility and revision-scoped evidence invalidation',
  )
  console.log(JSON.stringify({ passed }, null, 2))
} finally {
  await client?.close()
  await rm(root, { recursive: true, force: true })
}
