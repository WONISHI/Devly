import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
const root = await mkdtemp(join(tmpdir(), 'devly-attachments-')),
  requests = [],
  checks = [],
  png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  )
let db, service, selected
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const c of req) raw += c
  requests.push(JSON.parse(raw))
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Observed attached input.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\ndata: [DONE]\n\n`,
  )
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
try {
  await mkdir(join(root, 'project'))
  await writeFile(join(root, 'notes.md'), 'ATTACHMENT_REAL_TEXT\nSecond line.')
  await writeFile(join(root, 'image.png'), png)
  await writeFile(join(root, 'bad.txt'), Buffer.from([255, 0]))
  await writeFile(join(root, 'secret.txt'), 'sk-attachment-secret-must-reject-12345')
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: join(root, 'project') })
  const vault = {
    initialize: async () => {},
    reconcile: async () => {},
    available: () => false,
    read: async () => {
      throw Error('unexpected key read')
    },
  }
  const make = async () => {
    service = new LocalDataService(db, vault, {
      credential: async () => null,
      file: async () => selected ?? null,
    })
    await service.initialize()
  }
  await make()
  const call = async (operation, args = {}) =>
    (await service.execute({ operation, args }, () => true)).data
  let provider = await call('providers.save', {
    name: 'attachment fixture',
    protocol: 'chat-completions',
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    model: 'vision-declared-fixture',
  })
  const settings = await call('settings.get', { projectId: p.id })
  await call('settings.save', {
    projectId: p.id,
    settings: { ...settings, defaultProviderId: provider.id, defaultModel: provider.model },
  })
  selected = join(root, 'notes.md')
  const imported = await call('attachments.import', { projectId: p.id, sessionId: null }),
    scope = { projectId: imported.projectId, sessionId: imported.sessionId }
  assert.equal(imported.attachment.mime, 'text/plain')
  assert.equal(requests.length, 0)
  selected = join(root, 'image.png')
  const image = await call('attachments.import', scope)
  const refs = [imported, image].map((item) => ({
    blobId: item.attachment.id,
    digest: item.attachment.digest,
  }))
  for (const name of ['bad.txt', 'secret.txt']) {
    selected = join(root, name)
    await assert.rejects(call('attachments.import', scope))
  }
  const start = (text, attachments = refs) =>
    call('chat.start', {
      ...scope,
      turnId: randomUUID(),
      text,
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'chat',
      selectedPaths: [],
      attachments,
    })
  await assert.rejects(start('cannot send image yet'), (e) => e.info.message.includes('视觉'))
  assert.equal(requests.length, 0)
  assert.equal((await call('sessions.messages', scope)).items.length, 0)
  provider = await call('providers.save', {
    id: provider.id,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    model: provider.model,
    compatibility: { ...provider.compatibility, vision: 'supported' },
  })
  async function finished() {
    for (let i = 0; i < 300; i++) {
      const s = await call('chat.read', scope)
      if (s.turn?.state === 'completed') return s
      await new Promise((r) => setTimeout(r, 20))
    }
    throw Error('attachment turn timeout')
  }
  await start('inspect selected files')
  await finished()
  const wire = requests[0].messages.find((m) => m.role === 'user').content
  assert.ok(wire.some((p) => p.type === 'text' && p.text.includes('ATTACHMENT_REAL_TEXT')))
  assert.equal(
    wire.find((p) => p.type === 'image_url').image_url.url,
    `data:image/png;base64,${png.toString('base64')}`,
  )
  const messages = await call('sessions.messages', scope),
    user = messages.items.find((m) => m.role === 'user')
  assert.equal(user.parts.filter((p) => p.type === 'blob').length, 2)
  assert.equal(
    user.parts.find((p) => p.attachment?.mime === 'image/png').attachment.digest,
    image.attachment.digest,
  )
  await assert.rejects(call('blobs.remove', { ...scope, blobId: image.attachment.id }))
  checks.push(
    'Actual selected text/image files import locally without HTTP; unsupported/secret files reject; unknown vision sends nothing, declared vision maps real bytes and durable message references prevent deletion',
  )
  await service.close()
  await db.close()
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  await make()
  await start('continue after restart', [])
  await finished()
  assert.ok(JSON.stringify(requests[1].messages).includes('ATTACHMENT_REAL_TEXT'))
  assert.ok(JSON.stringify(requests[1].messages).includes(png.toString('base64')))
  const other = await call('sessions.create', { projectId: p.id })
  await assert.rejects(
    call('chat.start', {
      projectId: p.id,
      sessionId: other.id,
      turnId: randomUUID(),
      text: 'cross-session must fail',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'chat',
      attachments: refs,
    }),
  )
  assert.equal(requests.length, 2)
  checks.push(
    'Restart continuation reloads only completed message attachments from the correct session; wrong-session references cannot transfer bytes',
  )
  const incompatible = await call('providers.save', {
    name: 'nonvisual fixture',
    protocol: 'chat-completions',
    baseUrl: provider.baseUrl,
    model: 'unknown-vision',
  })
  await call('sessions.bind', {
    ...scope,
    providerId: incompatible.id,
    model: incompatible.model,
    allowHistory: true,
  })
  await assert.rejects(
    call('chat.start', {
      ...scope,
      turnId: randomUUID(),
      text: 'do not silently discard old image',
      expectedProviderId: incompatible.id,
      expectedModel: incompatible.model,
      mode: 'chat',
    }),
    (e) => e.info.message.includes('视觉'),
  )
  assert.equal(requests.length, 2)
  await call('sessions.bind', {
    ...scope,
    providerId: provider.id,
    model: provider.model,
    allowHistory: true,
  })
  await writeFile(
    join(root, 'storage/blobs', `${image.attachment.id}.bin`),
    Buffer.from('externally replaced'),
  )
  await assert.rejects(start('tampered attachment must not be sent', []))
  assert.equal(requests.length, 2)
  assert.equal(await readFile(join(root, 'notes.md'), 'utf8'), 'ATTACHMENT_REAL_TEXT\nSecond line.')
  checks.push(
    'Explicit provider switch does not discard unsupported image history; externally changed blob bytes fail before HTTP; selected originals are untouched',
  )
  console.log(JSON.stringify({ actualFileImports: true, modelFixture: true, checks }, null, 2))
} finally {
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(root, { recursive: true, force: true })
}
