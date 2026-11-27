import { scheduleSchema } from '../../shared/schedule-contracts'
import { taskFamilySchema } from '../../shared/agent-contracts'
import { webInput } from '../../shared/web-contracts'
import { attachmentInfo } from '../../shared/attachment-contracts'
import { skillSelection } from '../../shared/extension-contracts'
import { contextRecord, managedWorkspace, mcpServer } from '../../shared/extension-contracts'
import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, rename, lstat, open, rm, chmod } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import { migrations } from './migrations'
import { settingsSchema, providerInputSchema } from '../../shared/data-contracts'
import { agentInfoSchema, agentToolSchema } from '../../shared/agent-contracts'
import { providerReportSchema } from '../../shared/provider-contracts'
const item = z
  .object({
    name: z.string().regex(/^[a-f0-9-]{36}\.bin$/),
    bytes: z
      .number()
      .int()
      .nonnegative()
      .max(8 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
const manifestSchema = z
  .object({
    format: z.literal('devly-backup-v1'),
    version: z.number().int().min(8).max(migrations.length),
    createdAt: z.number().int(),
    databaseHash: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.array(item).max(10000),
  })
  .strict()
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
function validateContents(db: Database.Database) {
  if (
    Number(db.pragma('user_version', { simple: true })) >= 15 &&
    db
      .prepare('SELECT 1 FROM schedule_daily_counts WHERE count<0 OR typeof(count)<>? LIMIT 1')
      .get('integer')
  )
    throw new Error('BACKUP_SCHEDULE_BUDGET')
  if (Number(db.pragma('user_version', { simple: true })) >= 14)
    for (const row of db.prepare('SELECT * FROM local_schedules').iterate() as Iterable<
      Record<string, unknown>
    >) {
      const config = scheduleSchema.parse(JSON.parse(String(row.body)))
      if (config.enabled || config.id !== row.id || config.projectId !== row.project_id)
        throw new Error('Invalid schedule scope')
    }
  if (Number(db.pragma('user_version', { simple: true })) >= 13)
    for (const row of db
      .prepare(
        "SELECT id,name,mime,bytes,digest FROM blobs WHERE kind='attachment' AND digest IS NOT NULL",
      )
      .iterate())
      attachmentInfo.parse(row)
  if (Number(db.pragma('user_version', { simple: true })) >= 12)
    for (const row of db.prepare('SELECT * FROM web_configs').iterate() as Iterable<
      Record<string, unknown>
    >) {
      const config = webInput.parse(JSON.parse(String(row.body)))
      if (config.projectId !== row.project_id || row.credential_ref !== null)
        throw new Error('BACKUP_WEB')
    }
  // Backups are data, never an executable extension of the local database schema.
  if (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type IN ('trigger','view') OR upper(sql) LIKE '%CREATE VIRTUAL TABLE%' LIMIT 1",
      )
      .get()
  )
    throw new Error('BACKUP_SCHEMA')
  if (Number(db.pragma('user_version', { simple: true })) >= 9)
    for (const row of db
      .prepare('SELECT id,project_id,body FROM project_context')
      .iterate() as Iterable<Record<string, unknown>>) {
      const record = contextRecord.parse(JSON.parse(String(row.body)))
      if (record.id !== row.id || record.projectId !== row.project_id)
        throw new Error('BACKUP_CONTEXT')
    }
  if (Number(db.pragma('user_version', { simple: true })) >= 10)
    for (const row of db
      .prepare('SELECT id,project_id,workspace_project_id,body FROM managed_workspaces')
      .iterate() as Iterable<Record<string, unknown>>) {
      const record = managedWorkspace.parse(JSON.parse(String(row.body)))
      if (
        record.id !== row.id ||
        record.projectId !== row.project_id ||
        record.workspaceProjectId !== row.workspace_project_id
      )
        throw new Error('BACKUP_WORKSPACE')
    }
  if (Number(db.pragma('user_version', { simple: true })) >= 11)
    for (const row of db.prepare('SELECT * FROM mcp_servers').iterate() as Iterable<
      Record<string, unknown>
    >) {
      if (row.credential_ref !== null) throw new Error('BACKUP_CREDENTIALS')
      const record = mcpServer.parse({
        ...JSON.parse(String(row.body)),
        revision: row.revision,
        hasCredential: false,
      })
      if (record.id !== row.id || record.projectId !== row.project_id) throw new Error('BACKUP_MCP')
    }
  if (Number(db.pragma('user_version', { simple: true })) >= 11)
    for (const row of db.prepare('SELECT body FROM project_skills').iterate() as Iterable<
      Record<string, unknown>
    >) {
      const entries = JSON.parse(String(row.body))
      if (!Array.isArray(entries) || entries.length > 8) throw new Error('BACKUP_SKILLS')
      entries.forEach((value) => skillSelection.parse(value))
    }
  if (Number(db.pragma('user_version', { simple: true })) >= 10)
    for (const row of db
      .prepare(
        'SELECT parent_turn_id,root_turn_id,workspace_id,context_project_id,body FROM task_links',
      )
      .iterate() as Iterable<Record<string, unknown>>) {
      const family = taskFamilySchema.parse(JSON.parse(String(row.body)))
      if (
        family.parentTurnId !== row.parent_turn_id ||
        family.rootTurnId !== row.root_turn_id ||
        family.workspaceId !== row.workspace_id ||
        family.contextProjectId !== row.context_project_id
      )
        throw new Error('BACKUP_TASK_LINK')
    }
  const ids = new Set<string>()
  for (const row of db.prepare('SELECT * FROM providers').iterate() as Iterable<
    Record<string, unknown>
  >) {
    ids.add(z.uuid().parse(row.id))
    providerInputSchema.parse({
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.base_url,
      model: row.model,
      compatibility: JSON.parse(String(row.compatibility)),
    })
    if (row.report !== null) providerReportSchema.parse(JSON.parse(String(row.report)))
  }
  for (const row of db.prepare('SELECT scope,value FROM settings').iterate() as Iterable<
    Record<string, unknown>
  >) {
    if (row.scope !== 'global') z.uuid().parse(row.scope)
    const settings = settingsSchema.parse(JSON.parse(String(row.value)))
    if (settings.defaultProviderId && !ids.has(settings.defaultProviderId))
      throw new Error('BACKUP_CONFIG')
  }
  for (const row of db.prepare('SELECT id,project_id,title FROM sessions').iterate() as Iterable<
    Record<string, unknown>
  >) {
    z.uuid().parse(row.id)
    z.uuid().parse(row.project_id)
    z.string().min(1).max(200).parse(row.title)
  }
  for (const row of db.prepare('SELECT id,path,name FROM projects').iterate() as Iterable<
    Record<string, unknown>
  >) {
    z.uuid().parse(row.id)
    z.string().min(1).parse(row.path)
    z.string().min(1).max(200).parse(row.name)
  }
  for (const row of db
    .prepare('SELECT agent_info FROM turns WHERE agent_info IS NOT NULL')
    .iterate() as Iterable<Record<string, unknown>>)
    agentInfoSchema.parse(JSON.parse(String(row.agent_info)))
  for (const row of db
    .prepare("SELECT payload FROM tool_calls WHERE payload != '{}'")
    .iterate() as Iterable<Record<string, unknown>>)
    agentToolSchema.parse(JSON.parse(String(row.payload)))
  for (const row of db
    .prepare("SELECT payload FROM approvals WHERE payload != '{}'")
    .iterate() as Iterable<Record<string, unknown>>)
    agentToolSchema.shape.approval.parse(JSON.parse(String(row.payload)))
}
async function bytes(path: string, maximum: number) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximum) throw new Error('BACKUP_LIMIT')
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}
async function atomic(path: string, text: string) {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx', flush: true })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
export async function inspectBackup(path: string) {
  if (!(await lstat(path)).isDirectory() || !(await lstat(join(path, 'blobs'))).isDirectory())
    throw new Error('BACKUP_INVALID')
  const raw = await bytes(join(path, 'manifest.json'), 2 * 1024 * 1024)
  const manifest = manifestSchema.parse(JSON.parse(raw.toString('utf8')))
  if (new Set(manifest.files.map((f) => f.name)).size !== manifest.files.length)
    throw new Error('BACKUP_INVALID')
  const database = await bytes(join(path, 'devly.sqlite'), 256 * 1024 * 1024)
  if (hash(database) !== manifest.databaseHash) throw new Error('BACKUP_CHANGED')
  let total = database.length
  for (const file of manifest.files) {
    const value = await bytes(join(path, 'blobs', file.name), 8 * 1024 * 1024)
    total += value.length
    if (total > 512 * 1024 * 1024 || value.length !== file.bytes || hash(value) !== file.sha256)
      throw new Error('BACKUP_CHANGED')
  }
  const db = new Database(join(path, 'devly.sqlite'), { readonly: true, fileMustExist: true })
  try {
    if (
      db.pragma('user_version', { simple: true }) !== manifest.version ||
      db.pragma('quick_check', { simple: true }) !== 'ok' ||
      (db.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('BACKUP_INVALID')
    if (
      (
        db
          .prepare('SELECT count(*) AS n FROM providers WHERE credential_ref IS NOT NULL')
          .get() as { n: number }
      ).n
    )
      throw new Error('BACKUP_CREDENTIALS')
    validateContents(db)
    const refs = db
      .prepare(
        manifest.version >= 13 ? 'SELECT id,bytes,digest FROM blobs' : 'SELECT id,bytes FROM blobs',
      )
      .all() as { id: string; bytes: number; digest?: string | null }[]
    const files = new Map(manifest.files.map((file) => [file.name, file.bytes]))
    if (
      refs.length !== manifest.files.length ||
      refs.some((ref) => files.get(`${ref.id}.bin`) !== ref.bytes)
    )
      throw new Error('BACKUP_INVALID')
    if (
      refs.some(
        (ref) =>
          ref.digest &&
          manifest.files.find((file) => file.name === `${ref.id}.bin`)?.sha256 !== ref.digest,
      )
    )
      throw new Error('BACKUP_ATTACHMENT_DIGEST')
    return {
      manifest,
      summary: {
        version: manifest.version,
        createdAt: manifest.createdAt,
        projects: (
          db.prepare('SELECT count(*) AS n FROM projects WHERE managed=0 AND removed=0').get() as {
            n: number
          }
        ).n,
        sessions: (db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n,
        blobs: refs.length,
        bytes: total,
        digest: hash(JSON.stringify(manifest)),
      },
    }
  } finally {
    db.close()
  }
}
export async function createBackup(db: Database.Database, root: string, target: string) {
  const temporary = join(dirname(target), `.devly-backup-${randomUUID()}`)
  if (await lstat(target).catch(() => null)) throw new Error('BACKUP_EXISTS')
  try {
    await mkdir(temporary, { mode: 0o700 })
    await mkdir(join(temporary, 'blobs'), { mode: 0o700 })
    await db.backup(join(temporary, 'devly.sqlite'))
    await chmod(join(temporary, 'devly.sqlite'), 0o600)
    const copy = new Database(join(temporary, 'devly.sqlite'))
    let refs: { id: string; bytes: number }[]
    try {
      copy.pragma('journal_mode = DELETE')
      copy.prepare('UPDATE providers SET credential_ref=NULL, report=NULL').run()
      if (Number(copy.pragma('user_version', { simple: true })) >= 14) {
        for (const row of copy.prepare('SELECT id,body FROM local_schedules').all() as {
          id: string
          body: string
        }[])
          copy
            .prepare('UPDATE local_schedules SET body=? WHERE id=?')
            .run(JSON.stringify({ ...JSON.parse(row.body), enabled: false }), row.id)
      }
      if (Number(copy.pragma('user_version', { simple: true })) >= 11)
        copy.prepare('UPDATE mcp_servers SET credential_ref=NULL').run()
      if (Number(copy.pragma('user_version', { simple: true })) >= 12)
        copy.prepare('UPDATE web_configs SET credential_ref=NULL').run()
      // VACUUM removes free pages which may contain old credential references/configuration.
      copy.exec('VACUUM')
      refs = copy.prepare('SELECT id,bytes FROM blobs').all() as { id: string; bytes: number }[]
    } finally {
      copy.close()
    }
    if (refs.length > 10000) throw new Error('BACKUP_LIMIT')
    const files = []
    let total = (await lstat(join(temporary, 'devly.sqlite'))).size
    for (const ref of refs) {
      const name = item.shape.name.parse(`${ref.id}.bin`)
      const value = await bytes(join(root, 'blobs', name), 8 * 1024 * 1024)
      total += value.length
      if (total > 512 * 1024 * 1024 || value.length !== ref.bytes) throw new Error('BACKUP_LIMIT')
      await writeFile(join(temporary, 'blobs', name), value, { mode: 0o600, flag: 'wx' })
      files.push({ name, bytes: value.length, sha256: hash(value) })
    }
    const manifest = manifestSchema.parse({
      format: 'devly-backup-v1',
      version: migrations.length,
      createdAt: Date.now(),
      databaseHash: hash(await bytes(join(temporary, 'devly.sqlite'), 256 * 1024 * 1024)),
      files,
    })
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest), {
      mode: 0o600,
      flag: 'wx',
      flush: true,
    })
    const checked = await inspectBackup(temporary)
    await rename(temporary, target)
    return checked.summary
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
const pointerSchema = z.object({ generation: z.uuid() }).strict()
export async function stageRestore(logicalRoot: string, source: string, digest: string) {
  const checked = await inspectBackup(source)
  if (checked.summary.digest !== digest) throw new Error('BACKUP_CHANGED')
  const generation = randomUUID(),
    target = join(logicalRoot, 'generations', generation)
  await mkdir(join(logicalRoot, 'generations'), { recursive: true, mode: 0o700 })
  try {
    await mkdir(target, { mode: 0o700 })
    await mkdir(join(target, 'blobs'), { mode: 0o700 })
    await writeFile(
      join(target, 'devly.sqlite'),
      await bytes(join(source, 'devly.sqlite'), 256 * 1024 * 1024),
      { mode: 0o600, flag: 'wx' },
    )
    for (const file of checked.manifest.files)
      await writeFile(
        join(target, 'blobs', file.name),
        await bytes(join(source, 'blobs', file.name), 8 * 1024 * 1024),
        { mode: 0o600, flag: 'wx' },
      )
    await writeFile(join(target, 'manifest.json'), JSON.stringify(checked.manifest), {
      mode: 0o600,
      flag: 'wx',
      flush: true,
    })
    if ((await inspectBackup(target)).summary.digest !== digest) throw new Error('BACKUP_CHANGED')
    await atomic(join(logicalRoot, 'pending-store.json'), JSON.stringify({ generation }))
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}
export async function resolveStore(logicalRoot: string) {
  let recoveryError = false
  const pendingPath = join(logicalRoot, 'pending-store.json')
  try {
    const pending = await bytes(pendingPath, 4096)
      .then((value) => value.toString('utf8'))
      .catch((error) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
    if (pending) {
      const next = pointerSchema.parse(JSON.parse(pending))
      await inspectBackup(join(logicalRoot, 'generations', next.generation))
      // Only the pointer is replaced. The previous DB and blobs remain available for rollback.
      await atomic(join(logicalRoot, 'active-store.json'), JSON.stringify(next))
      await rm(pendingPath, { force: true })
    }
  } catch {
    recoveryError = true
  }

  let generation: string | null = null
  try {
    const current = await bytes(join(logicalRoot, 'active-store.json'), 4096).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    generation = current
      ? pointerSchema.parse(JSON.parse(current.toString('utf8'))).generation
      : null
    if (generation) {
      const candidate = join(logicalRoot, 'generations', generation)
      if (
        !(await lstat(candidate)).isDirectory() ||
        !(await lstat(join(candidate, 'devly.sqlite'))).isFile()
      )
        throw new Error('STORE_MISSING')
    }
  } catch {
    recoveryError = true
    generation = null
    // A damaged pointer must not create a blank replacement store.
    if (!(await lstat(join(logicalRoot, 'devly.sqlite'))).isFile())
      throw new Error('STORE_UNAVAILABLE')
  }
  return {
    root: generation ? join(logicalRoot, 'generations', generation) : logicalRoot,
    recoveryError,
  }
}
