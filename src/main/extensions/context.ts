import type { DatabaseClient } from '../data/client'
import type { ContextRecord } from '../../shared/extension-contracts'
import { redactToolText } from '../agent/tools'
export type ProjectGuidance = {
  kind: 'instruction' | 'memory' | 'skill'
  path: string
  scope: string
  text: string
}
export function applies(scope: string, path: string) {
  return scope === '.' || path === scope || path.startsWith(scope + '/')
}
export async function projectGuidance(
  database: Pick<DatabaseClient, 'execute'>,
  projectId: string,
  paths: string[],
  secret = '',
): Promise<ProjectGuidance[]> {
  const records = await database.execute<ContextRecord[]>('project.context.list', { projectId })
  return records
    .filter(
      (record) =>
        record.enabled &&
        (record.scope === '.' || paths.some((path) => applies(record.scope, path))),
    )
    .sort(
      (a, b) =>
        (a.scope === '.' ? 0 : a.scope.split('/').length) -
          (b.scope === '.' ? 0 : b.scope.split('/').length) || a.id.localeCompare(b.id),
    )
    .map((record) => ({
      kind: record.kind,
      path: `${record.kind}:${record.id}/${record.name}`,
      scope: record.scope,
      text: redactToolText(record.content, secret),
    }))
}
