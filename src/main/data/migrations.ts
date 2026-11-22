import type Database from 'better-sqlite3'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const migrations = [
  {
    version: 1,
    sql: `
    CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, last_opened_at INTEGER NOT NULL, removed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE app_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE settings(scope TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE providers(id TEXT PRIMARY KEY, name TEXT NOT NULL, protocol TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL, credential_ref TEXT);
  `,
  },
  {
    version: 2,
    sql: `
    CREATE TABLE sessions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), updated_at INTEGER NOT NULL, UNIQUE(id,project_id));
    CREATE INDEX sessions_page ON sessions(project_id,archived,updated_at DESC,id DESC);
    CREATE TABLE turns(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','cancelled')), FOREIGN KEY(session_id,project_id) REFERENCES sessions(id,project_id) ON DELETE CASCADE, UNIQUE(id,session_id));
    CREATE TABLE messages(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, turn_id TEXT, role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')), created_at INTEGER NOT NULL, FOREIGN KEY(turn_id,session_id) REFERENCES turns(id,session_id), UNIQUE(id,session_id));
    CREATE INDEX messages_page ON messages(session_id,created_at DESC,id DESC);
    CREATE TABLE blobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, session_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('log','attachment')), name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(session_id,project_id) REFERENCES sessions(id,project_id) ON DELETE CASCADE, UNIQUE(id,session_id));
    CREATE INDEX blobs_page ON blobs(session_id,created_at DESC,id DESC);
    CREATE TABLE message_parts(id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL, position INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','blob')), text TEXT, blob_id TEXT, FOREIGN KEY(message_id,session_id) REFERENCES messages(id,session_id) ON DELETE CASCADE, FOREIGN KEY(blob_id,session_id) REFERENCES blobs(id,session_id), CHECK((type='text' AND text IS NOT NULL AND blob_id IS NULL) OR (type='blob' AND text IS NULL AND blob_id IS NOT NULL)), UNIQUE(message_id,position));
    CREATE TABLE tool_calls(id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, session_id TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, FOREIGN KEY(turn_id,session_id) REFERENCES turns(id,session_id) ON DELETE CASCADE, UNIQUE(id,session_id));
    CREATE TABLE approvals(id TEXT PRIMARY KEY, tool_call_id TEXT NOT NULL, session_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','approved','denied')), FOREIGN KEY(tool_call_id,session_id) REFERENCES tool_calls(id,session_id) ON DELETE CASCADE);
    CREATE TABLE events(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, turn_id TEXT, sequence INTEGER NOT NULL, type TEXT NOT NULL, summary TEXT NOT NULL, blob_id TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(turn_id,session_id) REFERENCES turns(id,session_id), FOREIGN KEY(blob_id,session_id) REFERENCES blobs(id,session_id), UNIQUE(session_id,sequence));
  `,
  },
  {
    version: 3,
    sql: `ALTER TABLE providers ADD COLUMN compatibility TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE providers ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE providers ADD COLUMN report TEXT;`,
  },
  {
    version: 4,
    sql: `ALTER TABLE sessions ADD COLUMN provider_id TEXT;
    ALTER TABLE sessions ADD COLUMN model TEXT NOT NULL DEFAULT '';
    ALTER TABLE turns ADD COLUMN provider_id TEXT;
    ALTER TABLE turns ADD COLUMN model TEXT NOT NULL DEFAULT '';
    ALTER TABLE turns ADD COLUMN provider_revision INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE turns ADD COLUMN user_message_id TEXT;
    ALTER TABLE turns ADD COLUMN assistant_message_id TEXT;
    ALTER TABLE turns ADD COLUMN started_at INTEGER;
    ALTER TABLE turns ADD COLUMN ended_at INTEGER;
    ALTER TABLE turns ADD COLUMN phase TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE turns ADD COLUMN error TEXT;
    ALTER TABLE turns ADD COLUMN usage TEXT;
    ALTER TABLE turns ADD COLUMN finish TEXT;
    UPDATE turns SET status='failed',phase='failed',error='{"code":"INTERRUPTED","message":"生成被中断，请手动重新发送","status":null,"retryAfterSeconds":null}' WHERE status IN ('pending','running');
    CREATE UNIQUE INDEX one_active_turn_per_session ON turns(session_id) WHERE status IN ('pending','running');
    CREATE INDEX turns_latest ON turns(session_id,started_at DESC,id DESC);`,
  },
  {
    version: 5,
    sql: `ALTER TABLE turns ADD COLUMN agent_info TEXT;
    ALTER TABLE tool_calls ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE tool_calls ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX tools_turn_order ON tool_calls(turn_id,position,id);
    CREATE INDEX recent_sessions ON sessions(archived,updated_at DESC,id DESC);`,
  },
  {
    version: 6,
    sql: 'ALTER TABLE projects ADD COLUMN managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN (0,1));',
  },
] as const
export async function applyMigrations(db: Database.Database, backups: string): Promise<void> {
  let version = db.pragma('user_version', { simple: true }) as number
  if (version > migrations.length) throw new Error('Unsupported newer database')
  for (const migration of migrations) {
    if (migration.version <= version) continue
    if (version > 0)
      await db.backup(join(backups, `before-v${migration.version}-${randomUUID()}.sqlite`))
    db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })()
    version = migration.version
  }
}
