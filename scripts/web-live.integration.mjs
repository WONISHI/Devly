// Manual public no-credential GET only; never a paid search/model acceptance substitute.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-web-live-'))
let db, runtime
try {
  await mkdir(join(root, 'project'))
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: join(root, 'project') })
  await db.execute('web.save', { projectId: p.id, fetchEnabled: true })
  runtime = new ChatRuntime(db, {
    read: async () => {
      throw Error('unexpected credential access')
    },
  })
  const result = await runtime.web.fetch(
    p.id,
    { url: 'https://example.com/' },
    AbortSignal.timeout(20000),
  )
  assert.match(result.sources[0].title, /Example Domain/i)
  assert.match(result.sources[0].excerpt, /example/i)
  console.log(
    JSON.stringify(
      {
        actualPublicGet: true,
        url: result.sources[0].url,
        title: result.sources[0].title,
        retrievedAt: result.sources[0].retrievedAt,
        chars: result.sources[0].excerpt.length,
        noModelOrSearchApiRequest: true,
      },
      null,
      2,
    ),
  )
} finally {
  await runtime?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
