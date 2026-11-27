import { DatabaseClient } from '../out/main/data-client.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const [root, baseUrl] = process.argv.slice(2),
  project = join(root, 'project'),
  directory = join(project, '.devly/skills/ui-review')
await mkdir(join(directory, 'resources'), { recursive: true })
await writeFile(join(project, 'code.txt'), 'base\n')
await writeFile(
  join(directory, 'SKILL.md'),
  '---\nname: ui-review\ndescription: UI acceptance of real Skill guidance\n---\nUI_SKILL_INSTRUCTION Read the associated rules and actual source before editing.\n',
)
await writeFile(join(directory, 'resources/rules.txt'), 'UI_REAL_SKILL_RESOURCE\n')
for (const args of [
  ['init', '-b', 'main'],
  ['config', 'user.name', 'UI fixture'],
  ['config', 'user.email', 'fixture@example.invalid'],
  ['add', '.'],
  ['commit', '-m', 'base with local skill'],
])
  execFileSync('/usr/bin/git', args, { cwd: project, stdio: 'ignore' })
const db = new DatabaseClient(join(root, 'profile', 'storage'))
await db.ready
const p = await db.execute('internal.project.upsert', { path: project }),
  provider = await db.execute('providers.save', {
    name: 'UI local model',
    protocol: 'chat-completions',
    baseUrl,
    model: 'ui-fixture',
  })
const settings = await db.execute('settings.get', { projectId: p.id })
await db.execute('settings.save', {
  projectId: p.id,
  settings: {
    ...settings,
    defaultProviderId: provider.id,
    defaultModel: provider.model,
    projectPermission: 'ask',
    maxTokens: 20000,
    agentLimits: { ...settings.agentLimits, maxDurationMs: 180000 },
  },
})
await db.close()
await writeFile(
  join(root, 'fixture.json'),
  JSON.stringify({ project, projectId: p.id, providerId: provider.id }),
)
