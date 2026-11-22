import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  stat,
  readdir,
  unlink,
  open,
  rename,
  realpath,
  chmod,
  writeFile,
} from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createReadStream, createWriteStream, constants } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  defaultSettings,
  operationArgs,
  settingsSchema,
  type DataOperation,
} from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { applyMigrations, migrations } from './migrations'
import { compatibilitySchema, providerReportSchema } from '../../shared/provider-contracts'
import { ChatRepository } from '../chat/repository'

type Row = Record<string, unknown>
export class DataStore {
  private chat: ChatRepository
  private constructor(
    private db: Database.Database,
    private root: string,
  ) {
    this.chat = new ChatRepository(db, (projectId, sessionId) =>
      this.requireSession(projectId, sessionId),
    )
  }
  static async open(root: string): Promise<DataStore> {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await chmod(root, 0o700)
    for (const directory of ['backups', 'blobs'])
      await mkdir(join(root, directory), { recursive: true, mode: 0o700 })
    const path = join(root, 'devly.sqlite')
    const db = new Database(path)
    try {
      await chmod(path, 0o600)
      db.pragma('foreign_keys = ON')
      db.pragma('busy_timeout = 5000')
      await applyMigrations(db, join(root, 'backups'))
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = FULL')
      const store = new DataStore(db, root)
      await store.reconcileBlobs()
      return store
    } catch {
      db.close()
      throw new ContractError(failure('STORAGE_UNAVAILABLE'))
    }
  }
  private one(sql: string, ...args: (string | number | null)[]): Row | undefined {
    return this.db.prepare(sql).get(...args) as Row | undefined
  }
  private all(sql: string, ...args: (string | number | null)[]): Row[] {
    return this.db.prepare(sql).all(...args) as Row[]
  }
  private run(sql: string, ...args: (string | number | null)[]): Database.RunResult {
    return this.db.prepare(sql).run(...args)
  }
  private requireProject(id: string): Row {
    const row = this.one('SELECT * FROM projects WHERE id=? AND removed=0', id)
    if (!row) throw new ContractError(failure('NOT_FOUND'))
    return row
  }
  private requireSession(projectId: string, sessionId: string): Row {
    this.requireProject(projectId)
    const row = this.one('SELECT * FROM sessions WHERE id=? AND project_id=?', sessionId, projectId)
    if (!row) throw new ContractError(failure('NOT_FOUND'))
    return row
  }
  private project(row: Row) {
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      lastOpenedAt: row.last_opened_at,
      available: true,
      managed: !!row.managed,
    }
  }
  private provider(row: Row) {
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.base_url,
      model: row.model,
      hasCredential: row.credential_ref !== null,
      revision: Number(row.revision),
      compatibility: compatibilitySchema.parse(JSON.parse(String(row.compatibility ?? '{}'))),
      report: row.report ? providerReportSchema.parse(JSON.parse(String(row.report))) : null,
    }
  }
  private session(row: Row) {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      archived: !!row.archived,
      updatedAt: row.updated_at,
      providerId: row.provider_id,
      model: row.model,
      hasMessages: !!this.one('SELECT id FROM messages WHERE session_id=? LIMIT 1', String(row.id)),
    }
  }
  private blob(row: Row) {
    return {
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      kind: row.kind,
      name: row.name,
      mime: row.mime,
      bytes: row.bytes,
      createdAt: row.created_at,
    }
  }
  private settings(projectId: string | null) {
    if (projectId) this.requireProject(projectId)
    const local = this.one('SELECT value FROM settings WHERE scope=?', projectId ?? 'global')
    const global = this.one('SELECT value FROM settings WHERE scope=?', 'global')
    return settingsSchema.parse(
      JSON.parse(String((local ?? global)?.value ?? JSON.stringify(defaultSettings))),
    )
  }
  private usageSummary(providerId: string) {
    if (!this.one('SELECT id FROM providers WHERE id=?', providerId))
      throw new ContractError(failure('NOT_FOUND'))
    const budget = this.one('SELECT * FROM provider_usage_budgets WHERE provider_id=?', providerId)
    const stats = (since: number) => {
      const row = this.one(
        `SELECT COUNT(*) AS turns,
        COALESCE(SUM(json_extract(usage,'$.inputTokens')),0) AS input,
        COUNT(json_extract(usage,'$.inputTokens')) AS input_count,
        COALESCE(SUM(json_extract(usage,'$.outputTokens')),0) AS output,
        COUNT(json_extract(usage,'$.outputTokens')) AS output_count,
        COALESCE(SUM(json_extract(usage,'$.totalTokens')),0) AS total,
        COUNT(json_extract(usage,'$.totalTokens')) AS total_count
        FROM turns WHERE provider_id=? AND status NOT IN ('pending','running') AND COALESCE(started_at,0)>=?`,
        providerId,
        since,
      )!
      return {
        turns: Number(row.turns),
        input: { tokens: Number(row.input), reportedTurns: Number(row.input_count) },
        output: { tokens: Number(row.output), reportedTurns: Number(row.output_count) },
        total: { tokens: Number(row.total), reportedTurns: Number(row.total_count) },
      }
    }
    const since = Number(budget?.since ?? 0)
    return {
      providerId,
      lifetime: stats(0),
      period: stats(since),
      activeTurns: Number(
        this.one(
          "SELECT COUNT(*) AS count FROM turns WHERE provider_id=? AND status IN ('pending','running')",
          providerId,
        )!.count,
      ),
      budgetTokens: budget?.budget_tokens == null ? null : Number(budget.budget_tokens),
      since,
      updatedAt: Number(budget?.updated_at ?? 0),
    }
  }
  private activeProjectId(): string | null {
    const row = this.one("SELECT value FROM app_state WHERE key='active_project'")
    return row ? String(row.value) : null
  }
  private active(id: string | null): void {
    if (id)
      this.run(
        "INSERT INTO app_state(key,value) VALUES('active_project',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        id,
      )
    else this.run("DELETE FROM app_state WHERE key='active_project'")
  }
  private async reconcileBlobs(): Promise<void> {
    const indexed = new Set(this.all('SELECT id FROM blobs').map((row) => `${row.id}.bin`))
    for (const file of await readdir(join(this.root, 'blobs'))) {
      if (!/^[\da-f-]{36}\.(bin|tmp)$/.test(file)) continue
      if (!indexed.has(file)) await unlink(join(this.root, 'blobs', file))
    }
    const backups = (await readdir(join(this.root, 'backups'))).filter((file) =>
      /^before-v\d+-[\da-f-]+\.sqlite$/.test(file),
    )
    const sorted = await Promise.all(
      backups.map(async (file) => ({
        file,
        time: (await stat(join(this.root, 'backups', file))).mtimeMs,
      })),
    )
    for (const entry of sorted.sort((a, b) => b.time - a.time).slice(3))
      await unlink(join(this.root, 'backups', entry.file))
  }
  async execute(operation: string, raw: unknown): Promise<unknown> {
    if (operation === 'internal.agent.log') {
      const args = raw as {
        projectId: string
        sessionId: string
        turnId: string
        name: string
        output: string
      }
      this.requireSession(args.projectId, args.sessionId)
      if (
        !this.one(
          'SELECT id FROM turns WHERE id=? AND session_id=?',
          args.turnId,
          args.sessionId,
        ) ||
        typeof args.output !== 'string' ||
        Buffer.byteLength(args.output) > 1048576
      )
        throw new ContractError(failure('INVALID_REQUEST'))
      const total = Number(this.one('SELECT coalesce(sum(bytes),0) AS bytes FROM blobs')!.bytes)
      if (total + Buffer.byteLength(args.output) > 256 * 1024 * 1024)
        throw new ContractError(failure('LIMIT_EXCEEDED'))
      const id = randomUUID(),
        path = join(this.root, 'blobs', `${id}.bin`),
        now = Date.now()
      await writeFile(path, args.output, { flag: 'wx', mode: 0o600 })
      try {
        this.run(
          'INSERT INTO blobs(id,project_id,session_id,kind,name,mime,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)',
          id,
          args.projectId,
          args.sessionId,
          'log',
          `agent-${args.name.slice(0, 100)}.json`,
          'application/json',
          Buffer.byteLength(args.output),
          now,
        )
      } catch (error) {
        await unlink(path).catch(() => {})
        throw error
      }
      return { id }
    }
    if (operation.startsWith('internal.chat.')) return this.chat.execute(operation, raw)
    if (operation === 'internal.project.upsert') {
      const { path } = raw as { path: string }
      const canonical = await realpath(path)
      if (!(await stat(canonical)).isDirectory())
        throw new ContractError(failure('PROJECT_UNAVAILABLE'))
      const found = this.one('SELECT * FROM projects WHERE path=?', canonical)
      const id = found ? String(found.id) : randomUUID()
      this.db.transaction(() => {
        this.run(
          'INSERT INTO projects(id,path,name,last_opened_at,removed) VALUES(?,?,?,?,0) ON CONFLICT(path) DO UPDATE SET removed=0,last_opened_at=excluded.last_opened_at,name=excluded.name',
          id,
          canonical,
          basename(canonical),
          Date.now(),
        )
        this.active(id)
      })()
      return this.project(this.requireProject(id))
    }
    if (operation === 'internal.credential.ref') {
      const { providerId, ref } = raw as { providerId: string; ref?: string | null }
      const row = this.one('SELECT credential_ref FROM providers WHERE id=?', providerId)
      if (!row) throw new ContractError(failure('NOT_FOUND'))
      if (ref !== undefined)
        this.run(
          'UPDATE providers SET credential_ref=?, revision=revision+1, report=NULL WHERE id=?',
          ref,
          providerId,
        )
      return row.credential_ref
    }
    if (operation === 'internal.credential.refs')
      return this.all('SELECT credential_ref FROM providers WHERE credential_ref IS NOT NULL').map(
        (row) => row.credential_ref,
      )
    if (operation === 'internal.provider.config') {
      const { providerId } = raw as { providerId: string }
      const row = this.one('SELECT * FROM providers WHERE id=?', providerId)
      if (!row) throw new ContractError(failure('NOT_FOUND'))
      return { ...this.provider(row), credentialRef: row.credential_ref, revision: row.revision }
    }
    if (operation === 'internal.provider.report') {
      const { providerId, revision, report } = raw as {
        providerId: string
        revision: number
        report: unknown
      }
      return {
        saved:
          this.run(
            'UPDATE providers SET report=? WHERE id=? AND revision=?',
            JSON.stringify(providerReportSchema.parse(report)),
            providerId,
            revision,
          ).changes > 0,
      }
    }
    if (operation === 'internal.records.append') return this.appendRecord(raw)
    if (operation === 'internal.status') return { schemaVersion: migrations.length }
    if (!(operation in operationArgs)) throw new ContractError(failure('INVALID_REQUEST'))
    const args = operationArgs[operation as DataOperation].parse(raw) as Record<string, unknown>
    const projectId = args.projectId as string | undefined
    const sessionId = args.sessionId as string | undefined
    switch (operation) {
      case 'bootstrap':
        return {
          projects: await this.execute('projects.list', {}),
          activeProjectId: this.activeProjectId(),
          activeSessionId: this.activeProjectId()
            ? (this.one(
                'SELECT value FROM app_state WHERE key=?',
                `session:${this.activeProjectId()}`,
              )?.value ?? null)
            : null,
          settings: this.settings(null),
          providers: await this.execute('providers.list', {}),
          storage: { schemaVersion: migrations.length, credentialAvailable: false },
        }
      case 'projects.list':
        return this.all(
          'SELECT * FROM projects WHERE removed=0 ORDER BY last_opened_at DESC,id DESC',
        ).map((row) => this.project(row))
      case 'projects.switch': {
        const row = this.requireProject(projectId!)
        if (!(await stat(String(row.path)).catch(() => null))?.isDirectory())
          throw new ContractError(failure('PROJECT_UNAVAILABLE'))
        this.db.transaction(() => {
          this.run('UPDATE projects SET last_opened_at=? WHERE id=?', Date.now(), projectId!)
          this.active(projectId!)
        })()
        return this.project(this.requireProject(projectId!))
      }
      case 'projects.remove': {
        const removed =
          this.run('UPDATE projects SET removed=1 WHERE id=? AND removed=0', projectId!).changes > 0
        if (this.activeProjectId() === projectId) this.active(null)
        return { removed }
      }
      case 'usage.summary':
        return this.usageSummary(String(args.providerId))
      case 'usage.budget.save': {
        const providerId = String(args.providerId)
        const previous = this.usageSummary(providerId)
        const now = Date.now()
        this.run(
          'INSERT INTO provider_usage_budgets(provider_id,budget_tokens,since,updated_at) VALUES(?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET budget_tokens=excluded.budget_tokens,since=excluded.since,updated_at=excluded.updated_at',
          providerId,
          args.budgetTokens as number | null,
          args.reset ? now : previous.since,
          now,
        )
        return this.usageSummary(providerId)
      }
      case 'providers.list':
        return this.all('SELECT * FROM providers ORDER BY name,id').map((row) => this.provider(row))
      case 'providers.save': {
        const id = (args.id as string | undefined) ?? randomUUID()
        if (args.id && !this.one('SELECT id FROM providers WHERE id=?', id))
          throw new ContractError(failure('NOT_FOUND'))
        this.run(
          'INSERT INTO providers(id,name,protocol,base_url,model,credential_ref,compatibility) VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,protocol=excluded.protocol,base_url=excluded.base_url,model=excluded.model,compatibility=excluded.compatibility,revision=providers.revision+1,report=NULL',
          id,
          String(args.name),
          String(args.protocol),
          String(args.baseUrl),
          String(args.model),
          JSON.stringify(
            args.compatibility ??
              (args.id
                ? this.provider(this.one('SELECT * FROM providers WHERE id=?', id)!).compatibility
                : compatibilitySchema.parse({})),
          ),
        )
        return this.provider(this.one('SELECT * FROM providers WHERE id=?', id)!)
      }
      case 'providers.remove': {
        const id = String(args.providerId)
        return this.db.transaction(() => {
          const removed = this.run('DELETE FROM providers WHERE id=?', id).changes > 0
          for (const row of this.all('SELECT scope,value FROM settings')) {
            const value = settingsSchema.parse(JSON.parse(String(row.value)))
            if (value.defaultProviderId === id)
              this.run(
                'UPDATE settings SET value=? WHERE scope=?',
                JSON.stringify({ ...value, defaultProviderId: null, defaultModel: '' }),
                String(row.scope),
              )
          }
          return { removed }
        })()
      }
      case 'settings.get':
        return this.settings(projectId ?? null)
      case 'settings.save': {
        if (projectId) this.requireProject(projectId)
        const settings = settingsSchema.parse(args.settings)
        if (
          settings.defaultProviderId &&
          !this.one('SELECT id FROM providers WHERE id=?', settings.defaultProviderId)
        )
          throw new ContractError(failure('NOT_FOUND'))
        this.run(
          'INSERT INTO settings(scope,value) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET value=excluded.value',
          projectId ?? 'global',
          JSON.stringify(settings),
        )
        return settings
      }
      case 'sessions.general': {
        const path = join(this.root, 'general-chat')
        await mkdir(path, { recursive: true, mode: 0o700 })
        const project = (await this.execute('internal.project.upsert', { path })) as { id: string }
        this.run('UPDATE projects SET managed=1,name=? WHERE id=?', '通用聊天', project.id)
        return this.execute('sessions.create', { projectId: project.id, title: '新会话' })
      }
      case 'sessions.create': {
        this.requireProject(projectId!)
        const id = randomUUID()
        const settings = this.settings(projectId!)
        this.run(
          'INSERT INTO sessions(id,project_id,title,updated_at,provider_id,model) VALUES(?,?,?,?,?,?)',
          id,
          projectId!,
          String(args.title),
          Date.now(),
          settings.defaultProviderId,
          settings.defaultModel,
        )
        this.run(
          'INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          `session:${projectId}`,
          id,
        )
        return this.session(this.requireSession(projectId!, id))
      }
      case 'sessions.list': {
        this.requireProject(projectId!)
        const cursor = args.cursor as { time: number; id: string } | null
        const limit = Number(args.limit)
        const rows = this.all(
          `SELECT * FROM sessions WHERE project_id=? AND archived=? ${cursor ? 'AND (updated_at < ? OR (updated_at = ? AND id < ?))' : ''} ORDER BY updated_at DESC,id DESC LIMIT ?`,
          projectId!,
          args.archived ? 1 : 0,
          ...(cursor ? [cursor.time, cursor.time, cursor.id] : []),
          limit + 1,
        )
        const items = rows.slice(0, limit)
        const last = items.at(-1)
        return {
          items: items.map((row) => this.session(row)),
          nextCursor: rows.length > limit && last ? { time: last.updated_at, id: last.id } : null,
        }
      }
      case 'sessions.select': {
        const row = this.requireSession(projectId!, sessionId!)
        this.run(
          'INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          `session:${projectId}`,
          sessionId!,
        )
        return this.session(row)
      }
      case 'sessions.recent': {
        const cursor = args.cursor as { time: number; id: string } | null,
          limit = Number(args.limit)
        const rows = this.all(
          `SELECT s.* FROM sessions s JOIN projects p ON p.id=s.project_id WHERE p.removed=0 AND s.archived=? ${cursor ? 'AND (s.updated_at < ? OR (s.updated_at = ? AND s.id < ?))' : ''} ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`,
          args.archived ? 1 : 0,
          ...(cursor ? [cursor.time, cursor.time, cursor.id] : []),
          limit + 1,
        )
        const items = rows.slice(0, limit),
          last = items.at(-1)
        return {
          items: items.map((row) => this.session(row)),
          nextCursor: rows.length > limit && last ? { time: last.updated_at, id: last.id } : null,
        }
      }
      case 'sessions.get':
        return this.session(this.requireSession(projectId!, sessionId!))
      case 'sessions.bind':
        return this.db.transaction(() => {
          this.chat.bind(
            args as {
              projectId: string
              sessionId: string
              providerId: string
              model: string
              allowHistory: boolean
            },
          )
          if (args.setDefault) {
            const settings = {
              ...this.settings(projectId!),
              defaultProviderId: String(args.providerId),
              defaultModel: String(args.model),
            }
            this.run(
              'INSERT INTO settings(scope,value) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET value=excluded.value',
              projectId!,
              JSON.stringify(settings),
            )
          }
          return this.session(this.requireSession(projectId!, sessionId!))
        })()
      case 'chat.read':
        return this.chat.execute(operation, args)
      case 'sessions.rename':
      case 'sessions.archive': {
        this.requireSession(projectId!, sessionId!)
        if (operation === 'sessions.rename')
          this.run(
            'UPDATE sessions SET title=?,updated_at=? WHERE id=?',
            String(args.title),
            Date.now(),
            sessionId!,
          )
        else
          this.run(
            'UPDATE sessions SET archived=?,updated_at=? WHERE id=?',
            args.archived ? 1 : 0,
            Date.now(),
            sessionId!,
          )
        if (operation === 'sessions.archive' && args.archived)
          this.run(
            'DELETE FROM app_state WHERE key=? AND value=?',
            `session:${projectId}`,
            sessionId!,
          )
        return this.session(this.requireSession(projectId!, sessionId!))
      }
      case 'sessions.messages': {
        this.requireSession(projectId!, sessionId!)
        const cursor = args.cursor as { time: number; id: string } | null
        const limit = Number(args.limit)
        const rows = this.all(
          `SELECT m.*,t.status AS turn_state,t.error,t.usage,t.finish,t.provider_id,t.model,t.agent_info FROM messages m LEFT JOIN turns t ON t.id=m.turn_id WHERE m.session_id=? ${cursor ? 'AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))' : ''} ORDER BY m.created_at DESC,m.id DESC LIMIT ?`,
          sessionId!,
          ...(cursor ? [cursor.time, cursor.time, cursor.id] : []),
          limit + 1,
        )
        const items = rows.slice(0, limit)
        const last = items.at(-1)
        return {
          items: items.map((row) => ({
            id: row.id,
            sessionId: row.session_id,
            role: row.role,
            createdAt: row.created_at,
            turnId: row.turn_id,
            state: row.turn_state ?? null,
            error: row.error ? JSON.parse(String(row.error)) : null,
            usage: row.usage ? JSON.parse(String(row.usage)) : null,
            finish: row.finish ?? null,
            providerId: row.provider_id ?? null,
            model: row.model ?? '',
            agent: row.agent_info ? JSON.parse(String(row.agent_info)) : undefined,
            tools: row.role === 'assistant' ? this.chat.tools(String(row.turn_id)) : [],
            parts: this.all(
              'SELECT id,type,text,blob_id FROM message_parts WHERE message_id=? ORDER BY position',
              String(row.id),
            ).map((part) => ({
              id: part.id,
              type: part.type,
              text: part.text,
              blobId: part.blob_id,
            })),
          })),
          nextCursor: rows.length > limit && last ? { time: last.created_at, id: last.id } : null,
        }
      }
      case 'blobs.list': {
        this.requireSession(projectId!, sessionId!)
        const cursor = args.cursor as { time: number; id: string } | null
        const limit = Number(args.limit)
        const rows = this.all(
          `SELECT * FROM blobs WHERE session_id=? ${cursor ? 'AND (created_at < ? OR (created_at = ? AND id < ?))' : ''} ORDER BY created_at DESC,id DESC LIMIT ?`,
          sessionId!,
          ...(cursor ? [cursor.time, cursor.time, cursor.id] : []),
          limit + 1,
        )
        const items = rows.slice(0, limit)
        const last = items.at(-1)
        return {
          items: items.map((row) => this.blob(row)),
          nextCursor: rows.length > limit && last ? { time: last.created_at, id: last.id } : null,
        }
      }
      case 'blobs.read': {
        this.requireSession(projectId!, sessionId!)
        const row = this.one(
          'SELECT * FROM blobs WHERE id=? AND session_id=?',
          String(args.blobId),
          sessionId!,
        )
        if (!row) throw new ContractError(failure('NOT_FOUND'))
        const base = await realpath(join(this.root, 'blobs'))
        const path = join(base, `${row.id}.bin`)
        if ((await realpath(path)) !== path) throw new ContractError(failure('FORBIDDEN'))
        const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
        try {
          const data = Buffer.alloc(Number(args.length))
          const { bytesRead } = await file.read(data, 0, data.length, Number(args.offset))
          return {
            base64: data.subarray(0, bytesRead).toString('base64'),
            offset: args.offset,
            total: row.bytes,
            truncated: Number(args.offset) + bytesRead < Number(row.bytes),
          }
        } finally {
          await file.close()
        }
      }
      case 'blobs.remove': {
        this.requireSession(projectId!, sessionId!)
        const row = this.one(
          'SELECT id FROM blobs WHERE id=? AND session_id=?',
          String(args.blobId),
          sessionId!,
        )
        if (!row) return { removed: false }
        this.run('DELETE FROM blobs WHERE id=?', String(row.id))
        await unlink(join(this.root, 'blobs', `${row.id}.bin`)).catch(() => {})
        return { removed: true }
      }
      case 'blobs.prune': {
        this.requireSession(projectId!, sessionId!)
        const rows = this.all(
          "SELECT id FROM blobs WHERE session_id=? AND kind='log' AND created_at<? AND id NOT IN (SELECT blob_id FROM message_parts WHERE blob_id IS NOT NULL) AND id NOT IN (SELECT blob_id FROM events WHERE blob_id IS NOT NULL)",
          sessionId!,
          Number(args.before),
        )
        for (const row of rows)
          await this.execute('blobs.remove', { projectId, sessionId, blobId: row.id })
        return { removed: rows.length }
      }
      default:
        throw new ContractError(failure('INVALID_REQUEST'))
    }
  }
  async putBlob(raw: unknown): Promise<unknown> {
    const { projectId, sessionId, kind, sourcePath } = raw as {
      projectId: string
      sessionId: string
      kind: 'log' | 'attachment'
      sourcePath: string
    }
    this.requireSession(projectId, sessionId)
    if (!['log', 'attachment'].includes(kind)) throw new ContractError(failure('INVALID_REQUEST'))
    const source = await realpath(sourcePath)
    const info = await stat(source)
    const total = Number(this.one('SELECT coalesce(sum(bytes),0) AS bytes FROM blobs')!.bytes)
    if (!info.isFile() || info.size > 64 * 1024 * 1024 || total + info.size > 256 * 1024 * 1024)
      throw new ContractError(failure('LIMIT_EXCEEDED'))
    const id = randomUUID()
    const temporary = join(this.root, 'blobs', `${id}.tmp`)
    const target = join(this.root, 'blobs', `${id}.bin`)
    let bytes = 0
    try {
      await pipeline(
        createReadStream(source),
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length
            callback(
              bytes > 64 * 1024 * 1024 || total + bytes > 256 * 1024 * 1024
                ? new Error('Blob size limit')
                : null,
              chunk,
            )
          },
        }),
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      )
      const file = await open(temporary, 'r+')
      try {
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, target)
      this.run(
        'INSERT INTO blobs(id,project_id,session_id,kind,name,mime,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)',
        id,
        projectId,
        sessionId,
        kind,
        basename(source).slice(0, 255),
        kind === 'log' ? 'text/plain' : 'application/octet-stream',
        bytes,
        Date.now(),
      )
      return this.blob(this.one('SELECT * FROM blobs WHERE id=?', id)!)
    } catch {
      await unlink(temporary).catch(() => {})
      await unlink(target).catch(() => {})
      throw new ContractError(failure('STORAGE_UNAVAILABLE'))
    }
  }
  private appendRecord(raw: unknown): unknown {
    const { projectId, sessionId, text } = raw as {
      projectId: string
      sessionId: string
      text: string
    }
    this.requireSession(projectId, sessionId)
    if (typeof text !== 'string' || Buffer.byteLength(text) > 65536)
      throw new ContractError(failure('LIMIT_EXCEEDED'))
    const id = randomUUID()
    this.db.transaction(() => {
      this.run(
        'INSERT INTO messages(id,session_id,role,created_at) VALUES(?,?,?,?)',
        id,
        sessionId,
        'user',
        Date.now(),
      )
      this.run(
        'INSERT INTO message_parts(id,message_id,session_id,position,type,text) VALUES(?,?,?,0,?,?)',
        randomUUID(),
        id,
        sessionId,
        'text',
        text,
      )
    })()
    return { id }
  }
  close(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
    this.db.close()
  }
}
