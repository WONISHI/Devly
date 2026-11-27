import { DatabaseClient } from '../out/main/data-client.js'
import { mkdir, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
const [root, endpoint = 'http://127.0.0.1:1'] = process.argv.slice(2),
  project = join(root, 'project')
await mkdir(project, { recursive: true })
await mkdir(join(project, 'dist'), { recursive: true })
await writeFile(join(project, '.gitignore'), 'dist/\n')
await writeFile(join(project, 'dist/index.html'), '<!doctype html><h1>ACTUAL_BUILT_PREVIEW</h1>')
await writeFile(
  join(project, 'index.html'),
  '<!doctype html><html><head><title>Fixture static page</title><link rel="stylesheet" href="/style.css"></head><body><h1>ACTUAL_PREVIEW_PAGE</h1><label>Name<input id="name"></label><button id="apply" onclick="document.querySelector(\'#result\').textContent=document.querySelector(\'#name\').value">Apply</button><p id="result">not applied</p><button id="count" onclick="document.querySelector(\'#counter\').textContent=String(Number(document.querySelector(\'#counter\').textContent)+1)">Count</button><span id="counter">0</span><input id="file" type="file"><input id="password" type="password"><button id="choose-file" onclick="document.querySelector(\'#file\').click()">Choose local file</button></body></html>',
)
await writeFile(
  join(project, 'style.css'),
  'body{background:#f0f5f2;color:#17251d;font:18px system-ui;padding:32px}input,button{font:inherit;margin:8px;padding:8px}',
)
await writeFile(
  join(project, 'notes.md'),
  'REAL_UI_ATTACHMENT_TEXT\nImported locally until explicit send.',
)
await writeFile(
  join(project, 'one.png'),
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
    'base64',
  ),
)
await writeFile(join(project, '.env'), 'PREVIEW_SECRET_MUST_NOT_SERVE')
await writeFile(join(root, 'outside.txt'), 'OUTSIDE_PREVIEW_MUST_NOT_SERVE')
await symlink(join(root, 'outside.txt'), join(project, 'outside-link.txt'))
const db = new DatabaseClient(join(root, 'profile/storage'))
await db.ready
process.stderr.write('seed: database ready\n')
const p = await db.execute('internal.project.upsert', { path: project })
const provider = await db.execute('providers.save', {
    name: 'Text fixture',
    protocol: 'chat-completions',
    baseUrl: endpoint,
    model: 'text-fixture',
  }),
  vision = await db.execute('providers.save', {
    name: 'Vision declared fixture',
    protocol: 'chat-completions',
    baseUrl: endpoint,
    model: 'vision-fixture',
    compatibility: { vision: 'supported' },
  })
const settings = await db.execute('settings.get', { projectId: p.id })
await db.execute('settings.save', {
  projectId: p.id,
  settings: { ...settings, defaultProviderId: provider.id, defaultModel: provider.model },
})
process.stderr.write('seed: records saved\n')
await db.close()
process.stderr.write('seed: database closed\n')
await writeFile(
  join(root, 'fixture.json'),
  JSON.stringify({
    project,
    projectId: p.id,
    providerId: provider.id,
    visionProviderId: vision.id,
  }),
)
