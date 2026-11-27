import { DatabaseClient } from '../out/main/data-client.js'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
const root = process.argv[2],
  baseUrl = process.argv[3],
  project = join(root, 'project')
await mkdir(project)
await writeFile(join(project, 'existing.ts'), 'external edit preserved\n')
const db = new DatabaseClient(join(root, 'profile', 'storage'))
await db.ready
const p = await db.execute('internal.project.upsert', { path: project }),
  provider = await db.execute('providers.save', {
    name: 'Local recovery fixture',
    protocol: 'chat-completions',
    baseUrl,
    model: 'recovery-fixture',
  }),
  session = await db.execute('sessions.create', { projectId: p.id, title: 'Recovery UI fixture' })
await db.execute('sessions.bind', {
  projectId: p.id,
  sessionId: session.id,
  providerId: provider.id,
  model: provider.model,
})
const scope = { projectId: p.id, sessionId: session.id, turnId: randomUUID() },
  config = await db.execute('internal.provider.config', { providerId: provider.id })
await db.execute('internal.chat.begin', {
  ...scope,
  providerId: provider.id,
  model: provider.model,
  revision: config.revision,
  expectedProviderId: provider.id,
  expectedModel: provider.model,
  text: 'Inspect existing.ts before making changes.',
  agent: { mode: 'project-write', git: null, sources: [], summaries: [], rounds: 1, calls: 2 },
})
const record = {
  id: randomUUID(),
  callId: 'old-read',
  name: 'read_file',
  state: 'completed',
  approval: null,
  execution: null,
  input: '{"path":"existing.ts"}',
  output: JSON.stringify({
    ok: true,
    data: {
      path: 'existing.ts',
      contentHash: createHash('sha256').update('old version').digest('hex'),
    },
  }),
  error: null,
  truncated: false,
  blobId: null,
  position: 0,
}
await db.execute('internal.chat.tool', { ...scope, tool: record })
const pending = {
  ...record,
  id: randomUUID(),
  callId: 'old-command',
  name: 'run_command',
  state: 'running',
  input: '{"command":"never replay this fixture"}',
  output: '',
  position: 1,
  approval: {
    id: randomUUID(),
    digest: 'b'.repeat(64),
    expiresAt: Date.now() + 60000,
    state: 'pending',
  },
}
await db.execute('internal.chat.tool', { ...scope, tool: pending })
await db.execute('internal.chat.approval', {
  ...scope,
  toolId: pending.id,
  approval: pending.approval,
})
await db.close()
await writeFile(
  join(root, 'recovery-fixture.json'),
  JSON.stringify({ ...scope, providerId: provider.id, model: provider.model, project }),
)
