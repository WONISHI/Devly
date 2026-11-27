import { DatabaseClient } from '../out/main/data-client.js'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const root = process.argv[2],
  storage = join(root, 'profile', 'storage'),
  project = join(root, 'project')
await mkdir(project)
const db = new DatabaseClient(storage)
await db.ready
const p = await db.execute('internal.project.upsert', { path: project }),
  provider = await db.execute('providers.save', {
    name: 'Local performance fixture',
    protocol: 'chat-completions',
    baseUrl: 'http://127.0.0.1:1/v1',
    model: 'local-fixture',
  }),
  session = await db.execute('sessions.create', {
    projectId: p.id,
    title: '2000 message performance fixture',
  })
await db.execute('sessions.bind', {
  projectId: p.id,
  sessionId: session.id,
  providerId: provider.id,
  model: provider.model,
})
await db.close()
const SQLite = createRequire(import.meta.url)('better-sqlite3'),
  sql = new SQLite(join(storage, 'devly.sqlite')),
  base = Date.now() - 100000
const message = sql.prepare('INSERT INTO messages(id,session_id,role,created_at) VALUES(?,?,?,?)'),
  part = sql.prepare(
    "INSERT INTO message_parts(id,message_id,session_id,position,type,text) VALUES(?,?,?,0,'text',?)",
  )
let bytes = 0
sql.transaction(() => {
  for (let i = 0; i < 2000; i++) {
    const id = randomUUID(),
      text = `Fixture message ${i}\n` + 'Local history sample line 1234567890.\n'.repeat(220)
    bytes += Buffer.byteLength(text)
    message.run(id, session.id, i % 2 ? 'assistant' : 'user', base + i)
    part.run(randomUUID(), id, session.id, text)
  }
})()
sql.close()
const reopened = new DatabaseClient(storage)
await reopened.ready
const scope = { projectId: p.id, sessionId: session.id, turnId: randomUUID() },
  config = await reopened.execute('internal.provider.config', { providerId: provider.id })
await reopened.execute('internal.chat.begin', {
  ...scope,
  providerId: provider.id,
  model: provider.model,
  revision: config.revision,
  text: 'log fixture',
  expectedProviderId: provider.id,
  expectedModel: provider.model,
})
await reopened.execute('internal.chat.update', {
  ...scope,
  state: 'completed',
  phase: 'completed',
  text: 'log fixture',
  endedAt: Date.now(),
})
const blob = await reopened.execute('internal.agent.log', {
  ...scope,
  name: 'large-fixture',
  output: 'x'.repeat(1048576),
})
await reopened.close()
await writeFile(
  join(root, 'fixture.json'),
  JSON.stringify({
    ...scope,
    blobId: blob.id,
    messages: 2002,
    historyBytes: bytes,
    logBytes: 1048576,
  }),
)
