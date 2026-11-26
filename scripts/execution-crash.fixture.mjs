// Child process for the explicit native test only: terminate while an approval is durable.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = process.argv[2]
if (!root) throw new Error('Generated fixture root required')
const database = new DatabaseClient(join(root, 'profile'))
await database.ready
const project = (await database.execute('projects.list', {}))[0]
const provider = (await database.execute('providers.list', {}))[0]
const session = await database.execute('sessions.create', {
  projectId: project.id,
  title: 'Crash fixture',
})
const scope = { projectId: project.id, sessionId: session.id, turnId: randomUUID() }
const runtime = new ChatRuntime(
  database,
  { read: async () => '' },
  async () =>
    new Response(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'crash-call', type: 'function', function: { name: 'apply_patch', arguments: JSON.stringify({ changes: [{ path: 'crash-never.txt', expectedHash: null, content: 'must not execute' }] }) } }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    ),
)
await runtime.initialize()
await runtime.execute(
  'chat.start',
  {
    ...scope,
    text: 'Crash fixture',
    expectedProviderId: provider.id,
    expectedModel: provider.model,
    mode: 'project-write',
  },
  () => true,
)
for (let i = 0; i < 500; i++) {
  const snapshot = await runtime.execute(
    'chat.read',
    { projectId: project.id, sessionId: session.id },
    () => true,
  )
  if (snapshot.turn.phase === 'waiting_approval') {
    await writeFile(
      join(root, 'crash-scope.json'),
      JSON.stringify({
        scope,
        tool: snapshot.tools.find((tool) => tool.approval?.state === 'pending'),
      }),
    )
    // Deliberately bypass graceful shutdown. SQLite committed writes must survive process termination.
    process.exit(0)
  }
  await new Promise((resolve) => setTimeout(resolve, 20))
}
throw new Error('Crash fixture did not reach pending approval')
