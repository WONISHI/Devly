// Explicit manual verification only. Copies selected metadata + ciphertext, never plaintext.
import { createRequire } from 'node:module'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseClient } from '../out/main/data-client.js'
const source = process.env.DEVLY_LIVE_SOURCE_PROFILE,
  target = process.env.DEVLY_LIVE_TARGET_PROFILE,
  id = process.env.DEVLY_LIVE_PROVIDER_ID
if (!source || !target || !/^[a-f\d-]{36}$/.test(id || ''))
  throw new Error('Explicit source profile, target profile and selected Provider UUID required')
const require = createRequire(import.meta.url),
  SQLite = require('better-sqlite3')
const original = new SQLite(join(source, 'storage/devly.sqlite'), {
  readonly: true,
  fileMustExist: true,
})
let row
try {
  row = original.prepare('SELECT * FROM providers WHERE id=?').get(id)
} finally {
  original.close()
}
if (!row || row.protocol !== 'chat-completions' || !row.model || !row.credential_ref)
  throw new Error('Selected provider must have a model and protected credential')
const db = new DatabaseClient(join(target, 'storage'))
try {
  await db.ready
  const provider = await db.execute('providers.save', {
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    model: row.model,
    compatibility: JSON.parse(row.compatibility || '{}'),
  })
  await mkdir(join(target, 'storage/credentials'), { recursive: true, mode: 0o700 })
  await copyFile(
    join(source, 'storage/credentials', row.credential_ref + '.key'),
    join(target, 'storage/credentials', row.credential_ref + '.key'),
  )
  await db.execute('internal.credential.ref', { providerId: provider.id, ref: row.credential_ref })
  const settings = await db.execute('settings.get', { projectId: null })
  await db.execute('settings.save', {
    projectId: null,
    settings: {
      ...settings,
      defaultProviderId: provider.id,
      defaultModel: provider.model,
      maxTokens: 8192,
    },
  })
  await writeFile(
    join(target, 'selected-provider.json'),
    JSON.stringify({ model: provider.model, protocol: provider.protocol }),
    { mode: 0o600 },
  )
} finally {
  await db.close()
}
