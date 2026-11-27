import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { DatabaseClient } from '../out/main/data-client.js'
import { LocalDataService } from '../out/main/data-service.js'
import { ChatRuntime } from '../out/main/chat-runtime.js'
const root = await mkdtemp(join(tmpdir(), 'devly-skills-')),
  project = join(root, 'project'),
  path = '.agents/skills/review/SKILL.md',
  directory = join(project, '.agents/skills/review')
let db, service, runtime
const requests = [],
  checks = []
try {
  await mkdir(join(directory, 'resources'), { recursive: true })
  await writeFile(
    join(directory, 'SKILL.md'),
    '---\nname: review\ndescription: Inspect local review rules\n---\nSKILL_REAL_GUIDANCE Use read_skill_resource to inspect resources/rules.txt before answering.\n',
  )
  await writeFile(join(directory, 'resources/rules.txt'), 'ACTUAL_ASSOCIATED_RESOURCE\n')
  await writeFile(join(root, 'outside.txt'), 'outside scope\n')
  await symlink(join(root, 'outside.txt'), join(directory, 'resources/escape.txt'))
  db = new DatabaseClient(join(root, 'storage'))
  await db.ready
  const p = await db.execute('internal.project.upsert', { path: project }),
    provider = await db.execute('providers.save', {
      name: 'fixture',
      protocol: 'chat-completions',
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'fixture',
    })
  service = new LocalDataService(
    db,
    { initialize: async () => {}, reconcile: async () => {}, available: () => false },
    { credential: async () => null, file: async () => null },
  )
  await service.initialize()
  const call = async (operation, args = {}) =>
    (await service.execute({ operation, args: { projectId: p.id, ...args } }, () => true)).data
  const found = await call('skills.discover')
  assert.equal(found.length, 1)
  assert.equal(found[0].enabled, false)
  assert.ok((await call('skills.read', { path })).content.includes('SKILL_REAL_GUIDANCE'))
  await call('skills.select', { entries: [{ path, hash: found[0].hash }] })
  const frame = (delta, finish) =>
    `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
  runtime = new ChatRuntime(
    db,
    {
      read: async () => {
        throw Error('unexpected secret')
      },
    },
    async (url, init) => {
      const body = JSON.parse(init.body)
      requests.push(body)
      const result = body.messages.find((m) => m.role === 'tool')
      if (result) {
        assert.ok(result.content.includes('ACTUAL_ASSOCIATED_RESOURCE'))
        return new Response(
          frame({ content: 'Observed actual Skill resource.' }, 'stop') + 'data: [DONE]\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        )
      }
      assert.ok(body.messages.some((m) => String(m.content).includes('SKILL_REAL_GUIDANCE')))
      assert.ok(body.tools.some((t) => t.function.name === 'read_skill_resource'))
      return new Response(
        frame(
          {
            tool_calls: [
              {
                index: 0,
                id: 'skill-resource',
                type: 'function',
                function: {
                  name: 'read_skill_resource',
                  arguments: JSON.stringify({
                    skill: path,
                    file: 'resources/rules.txt',
                    startLine: 1,
                    endLine: 20,
                  }),
                },
              },
            ],
          },
          'tool_calls',
        ) + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      )
    },
  )
  await runtime.initialize()
  const session = await db.execute('sessions.create', { projectId: p.id })
  await db.execute('sessions.bind', {
    projectId: p.id,
    sessionId: session.id,
    providerId: provider.id,
    model: provider.model,
  })
  const scope = { projectId: p.id, sessionId: session.id }
  await runtime.execute(
    'chat.start',
    {
      ...scope,
      turnId: randomUUID(),
      text: 'Follow enabled Skill',
      expectedProviderId: provider.id,
      expectedModel: provider.model,
      mode: 'read-only',
      selectedPaths: [],
    },
    () => true,
  )
  let latest
  for (let i = 0; i < 100; i++) {
    latest = await runtime.execute('chat.read', scope, () => true)
    if (latest.turn.state === 'completed') break
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.equal(latest.turn.state, 'completed')
  assert.ok(latest.turn.agent.sources.some((s) => s.kind === 'skill' && s.path === path))
  assert.equal(latest.tools[0].name, 'read_skill_resource')
  assert.equal(latest.tools[0].state, 'completed')
  checks.push(
    'A real approved SKILL.md enters model context with provenance, causes an actual associated-resource tool read and is used in the next model round',
  )
  for (const file of ['../../outside.txt', 'resources/escape.txt'])
    await assert.rejects(
      runtime.skills.resource(
        p.id,
        JSON.stringify({ skill: path, file, startLine: 1, endLine: 20 }),
        new AbortController().signal,
      ),
    )
  await writeFile(join(directory, 'SKILL.md'), 'Changed Skill must be reviewed\n')
  assert.equal((await call('skills.discover'))[0].changed, true)
  const before = requests.length
  await assert.rejects(runtime.skills.guidance(p.id, new AbortController().signal))
  assert.equal(requests.length, before)
  await call('skills.select', { entries: [] })
  assert.deepEqual(await runtime.skills.selected(p.id), [])
  checks.push(
    'Traversal/symlink resources reject, changed content requires explicit re-review and removing selection prevents future automatic use',
  )
  console.log(JSON.stringify({ realSkillFiles: true, modelFixture: true, checks }, null, 2))
} finally {
  await runtime?.close().catch(() => {})
  await service?.close().catch(() => {})
  await db?.close().catch(() => {})
  await rm(root, { recursive: true, force: true })
}
