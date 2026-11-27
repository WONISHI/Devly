// A genuine v7 database in a generated profile. No personal data or credentials.
import { createRequire } from 'node:module'
import { mkdir, writeFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { migrations } from '../out/main/data-client.js'
const [root, endpoint] = process.argv.slice(2),
  project = join(root, '项目 中文 with spaces'),
  profile = join(root, '升级 profile 空格'),
  storage = join(profile, 'storage')
await mkdir(project, { recursive: true })
await mkdir(storage, { recursive: true })
await writeFile(join(project, 'hello.ts'), 'export const value = 1\n')
const canonicalProject = await realpath(project)
const SQLite = createRequire(import.meta.url)('better-sqlite3'),
  db = new SQLite(join(storage, 'devly.sqlite'))
const projectId = randomUUID(),
  sessionId = randomUUID(),
  providerId = randomUUID(),
  turnId = randomUUID(),
  userId = randomUUID(),
  assistantId = randomUUID(),
  now = Date.now()
try {
  db.pragma('foreign_keys=ON')
  for (const migration of migrations.slice(0, 7)) {
    db.exec(migration.sql)
    db.pragma(`user_version=${migration.version}`)
  }
  const settings = {
    version: 1,
    theme: 'dark',
    defaultProviderId: providerId,
    defaultModel: 'release-local-fixture',
    projectPermission: 'read-only',
    maxTokens: 4096,
    maxCost: 1,
    agentLimits: {
      maxCalls: 8,
      maxRounds: 4,
      maxDurationMs: 30000,
      maxOutputChars: 16384,
      contextChars: 24000,
    },
  }
  db.prepare('INSERT INTO projects(id,path,name,last_opened_at) VALUES(?,?,?,?)').run(
    projectId,
    canonicalProject,
    '项目 中文 with spaces',
    now,
  )
  db.prepare(
    'INSERT INTO providers(id,name,protocol,base_url,model,compatibility) VALUES(?,?,?,?,?,?)',
  ).run(
    providerId,
    'Local release fixture',
    'chat-completions',
    endpoint,
    'release-local-fixture',
    '{}',
  )
  db.prepare('INSERT INTO settings(scope,value) VALUES(?,?)').run(
    'global',
    JSON.stringify(settings),
  )
  db.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run('active_project', projectId)
  db.prepare('INSERT INTO app_state(key,value) VALUES(?,?)').run(`session:${projectId}`, sessionId)
  db.prepare(
    'INSERT INTO sessions(id,project_id,title,updated_at,provider_id,model) VALUES(?,?,?,?,?,?)',
  ).run(sessionId, projectId, '保留的旧会话', now, providerId, 'release-local-fixture')
  db.prepare(
    "INSERT INTO turns(id,session_id,project_id,status,phase,provider_id,model,user_message_id,assistant_message_id,started_at,ended_at) VALUES(?,?,?,'completed','completed',?,?,?,?,?,?)",
  ).run(
    turnId,
    sessionId,
    projectId,
    providerId,
    'release-local-fixture',
    userId,
    assistantId,
    now - 1,
    now,
  )
  for (const [id, role, text] of [
    [userId, 'user', 'STAGE12_OLD_USER'],
    [assistantId, 'assistant', 'STAGE12_UPGRADE_HISTORY'],
  ]) {
    db.prepare('INSERT INTO messages(id,session_id,turn_id,role,created_at) VALUES(?,?,?,?,?)').run(
      id,
      sessionId,
      turnId,
      role,
      now,
    )
    db.prepare(
      "INSERT INTO message_parts(id,message_id,session_id,position,type,text) VALUES(?,?,?,0,'text',?)",
    ).run(randomUUID(), id, sessionId, text)
  }
} finally {
  db.close()
}
await writeFile(
  join(root, 'upgrade-fixture.json'),
  JSON.stringify({
    profile,
    project: canonicalProject,
    projectId,
    sessionId,
    providerId,
    fromSchema: 7,
    toSchema: migrations.length,
  }),
)
