import { taskFamilySchema } from '../../shared/agent-contracts'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  contextInput,
  contextRecord,
  managedWorkspace,
  mcpInput,
  mcpServer,
  skillSelection,
} from '../../shared/extension-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { redactToolText } from '../agent/tools'
export class ExtensionRepository {
  constructor(
    private db: Database.Database,
    private requireProject: (id: string) => unknown,
  ) {}
  execute(operation: string, args: Record<string, unknown>): unknown {
    const projectId = String(args.projectId)
    this.requireProject(projectId)
    if (operation === 'internal.workspace.context') {
      const row = this.db
        .prepare('SELECT body FROM managed_workspaces WHERE workspace_project_id=?')
        .get(projectId) as { body: string } | undefined
      if (!row) return { contextProjectId: projectId, workspaceId: null }
      const workspace = managedWorkspace.parse(JSON.parse(row.body))
      return { contextProjectId: workspace.projectId, workspaceId: workspace.id }
    }
    if (operation === 'internal.task.link') {
      const family = taskFamilySchema.parse(args.family)
      const turn = this.db
        .prepare('SELECT project_id FROM turns WHERE id=?')
        .get(String(args.turnId)) as { project_id: string } | undefined
      if (turn?.project_id !== projectId) throw new ContractError(failure('FORBIDDEN'))
      this.db
        .prepare(
          'INSERT INTO task_links(turn_id,parent_turn_id,root_turn_id,workspace_id,context_project_id,body) VALUES(?,?,?,?,?,?) ON CONFLICT(turn_id) DO UPDATE SET body=excluded.body',
        )
        .run(
          String(args.turnId),
          family.parentTurnId,
          family.rootTurnId,
          family.workspaceId,
          family.contextProjectId,
          JSON.stringify(family),
        )
      return { saved: true }
    }
    if (operation === 'tasks.open') {
      const row = this.db
        .prepare(
          'SELECT t.project_id,t.session_id FROM turns t LEFT JOIN task_links l ON l.turn_id=t.id WHERE t.id=? AND (t.project_id=? OR l.context_project_id=? OR t.project_id IN (SELECT workspace_project_id FROM managed_workspaces WHERE project_id=?))',
        )
        .get(String(args.turnId), projectId, projectId, projectId) as
        { project_id: string; session_id: string } | undefined
      if (!row) throw new ContractError(failure('NOT_FOUND'))
      return { projectId: row.project_id, sessionId: row.session_id }
    }
    if (operation === 'internal.skills.get') {
      const row = this.db
        .prepare('SELECT body FROM project_skills WHERE project_id=?')
        .get(projectId) as { body: string } | undefined
      return row ? JSON.parse(row.body).map((value: unknown) => skillSelection.parse(value)) : []
    }
    if (operation === 'internal.skills.set') {
      const entries = (args.entries as unknown[]).map((value) => skillSelection.parse(value))
      if (entries.length > 8 || new Set(entries.map((e) => e.path)).size !== entries.length)
        throw new ContractError(failure('INVALID_REQUEST'))
      this.db
        .prepare(
          'INSERT INTO project_skills(project_id,body) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET body=excluded.body',
        )
        .run(projectId, JSON.stringify(entries))
      return { saved: true }
    }
    if (operation === 'mcp.servers')
      return this.db
        .prepare('SELECT * FROM mcp_servers WHERE project_id=? ORDER BY id LIMIT 10')
        .all(projectId)
        .map((value) => {
          const row = value as Record<string, unknown>
          return mcpServer.parse({
            ...JSON.parse(String(row.body)),
            id: row.id,
            revision: row.revision,
            hasCredential: row.credential_ref !== null,
          })
        })
    if (operation === 'mcp.save') {
      const input = mcpInput.parse(args),
        id = input.id ?? randomUUID(),
        old = this.db.prepare('SELECT project_id FROM mcp_servers WHERE id=?').get(id) as
          { project_id: string } | undefined
      if (old && old.project_id !== projectId) throw new ContractError(failure('FORBIDDEN'))
      const count = this.db
        .prepare('SELECT COUNT(*) AS n FROM mcp_servers WHERE project_id=?')
        .get(projectId) as { n: number }
      if (!old && count.n >= 10) throw new ContractError(failure('LIMIT_EXCEEDED'))
      this.db
        .prepare(
          'INSERT INTO mcp_servers(id,project_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,revision=revision+1',
        )
        .run(id, projectId, JSON.stringify({ ...input, id }))
      return (this.execute('mcp.servers', { projectId }) as { id: string }[]).find(
        (row) => row.id === id,
      )
    }
    if (operation === 'mcp.remove')
      return {
        removed:
          this.db
            .prepare('DELETE FROM mcp_servers WHERE id=? AND project_id=?')
            .run(String(args.serverId), projectId).changes > 0,
      }
    if (operation === 'internal.mcp.ref' || operation === 'internal.mcp.config') {
      const row = this.db
        .prepare('SELECT * FROM mcp_servers WHERE id=? AND project_id=?')
        .get(String(args.serverId), projectId) as Record<string, unknown> | undefined
      if (!row) throw new ContractError(failure('NOT_FOUND'))
      if (operation === 'internal.mcp.config')
        return {
          ...mcpServer.parse({
            ...JSON.parse(String(row.body)),
            revision: row.revision,
            hasCredential: row.credential_ref !== null,
          }),
          credentialRef: row.credential_ref,
        }
      if (args.ref !== undefined)
        this.db
          .prepare('UPDATE mcp_servers SET credential_ref=?,revision=revision+1 WHERE id=?')
          .run(args.ref, String(args.serverId))
      return row.credential_ref
    }
    if (operation === 'internal.workspace.list')
      return this.db
        .prepare('SELECT body FROM managed_workspaces WHERE project_id=? ORDER BY id LIMIT 100')
        .all(projectId)
        .map((row) => managedWorkspace.parse(JSON.parse(String((row as { body: string }).body))))
    if (operation === 'internal.workspace.save') {
      const record = managedWorkspace.parse(args)
      const old = this.db
        .prepare('SELECT project_id FROM managed_workspaces WHERE id=?')
        .get(record.id) as { project_id: string } | undefined
      if (old && old.project_id !== projectId) throw new ContractError(failure('FORBIDDEN'))
      this.db
        .prepare(
          'INSERT INTO managed_workspaces(id,project_id,workspace_project_id,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET workspace_project_id=excluded.workspace_project_id,body=excluded.body',
        )
        .run(record.id, projectId, record.workspaceProjectId, JSON.stringify(record))
      return record
    }
    if (operation === 'tasks.list')
      return this.db
        .prepare(
          `SELECT t.id,t.project_id AS projectId,t.session_id AS sessionId,s.title,COALESCE(json_extract(t.agent_info,'$.mode'),'chat') AS mode,t.status AS state,t.phase,t.started_at AS startedAt,l.parent_turn_id AS parentTurnId,l.root_turn_id AS rootTurnId,l.workspace_id AS workspaceId FROM turns t JOIN sessions s ON s.id=t.session_id LEFT JOIN task_links l ON l.turn_id=t.id WHERE t.project_id=? OR t.project_id IN (SELECT workspace_project_id FROM managed_workspaces WHERE project_id=?) ORDER BY t.started_at DESC,t.id DESC LIMIT 100`,
        )
        .all(projectId, projectId)
    if (operation === 'project.context.list')
      return this.db
        .prepare(
          'SELECT body FROM project_context WHERE project_id=? ORDER BY updated_at,id LIMIT 50',
        )
        .all(projectId)
        .map((row) => contextRecord.parse(JSON.parse(String((row as { body: string }).body))))
    if (operation === 'project.context.remove')
      return {
        removed:
          this.db
            .prepare('DELETE FROM project_context WHERE project_id=? AND id=?')
            .run(projectId, String(args.id)).changes > 0,
      }
    if (operation === 'project.context.save') {
      const input = contextInput.parse(args),
        id = input.id ?? randomUUID()
      if (redactToolText(input.content) !== input.content)
        throw new ContractError(failure('INVALID_REQUEST'))
      const prior = this.db.prepare('SELECT project_id FROM project_context WHERE id=?').get(id) as
        { project_id: string } | undefined
      if (prior && prior.project_id !== projectId) throw new ContractError(failure('FORBIDDEN'))
      const count = this.db
        .prepare('SELECT COUNT(*) AS n FROM project_context WHERE project_id=?')
        .get(projectId) as { n: number }
      if (!prior && count.n >= 50) throw new ContractError(failure('LIMIT_EXCEEDED'))
      const record = contextRecord.parse({ ...input, id, source: 'user', updatedAt: Date.now() })
      this.db
        .prepare(
          'INSERT INTO project_context(id,project_id,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at',
        )
        .run(id, projectId, JSON.stringify(record), record.updatedAt)
      return record
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
}
