import type Database from 'better-sqlite3'
import { webInput, webConfig } from '../../shared/web-contracts'
export class WebRepository {
  constructor(
    private db: Database.Database,
    private requireProject: (id: string) => unknown,
  ) {}
  execute(operation: string, args: Record<string, unknown>): unknown {
    const projectId = String(args.projectId)
    this.requireProject(projectId)
    const row = this.db.prepare('SELECT * FROM web_configs WHERE project_id=?').get(projectId) as
      { body: string; revision: number; credential_ref: string | null } | undefined
    if (operation === 'web.save') {
      const value = webInput.parse(args)
      this.db
        .prepare(
          'INSERT INTO web_configs(project_id,body) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET body=excluded.body,revision=revision+1',
        )
        .run(projectId, JSON.stringify(value))
      return this.execute('web.get', { projectId })
    }
    if (operation === 'internal.web.ref') {
      if (args.ref !== undefined) {
        if (!row) this.execute('web.save', { projectId })
        this.db
          .prepare('UPDATE web_configs SET credential_ref=?,revision=revision+1 WHERE project_id=?')
          .run(args.ref, projectId)
      }
      return row?.credential_ref ?? null
    }
    const config = webConfig.parse({
      ...webInput.parse(row ? JSON.parse(row.body) : { projectId }),
      revision: row?.revision ?? 0,
      hasCredential: !!row?.credential_ref,
    })
    return operation === 'internal.web.config'
      ? { ...config, credentialRef: row?.credential_ref ?? null }
      : config
  }
}
