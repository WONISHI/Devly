import { realpath } from 'node:fs/promises'
import type { DatabaseClient } from '../data/client'
import type { RecentProject } from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { ReadOnlyToolbox } from '../agent/tools'
export async function projectTools(database: Pick<DatabaseClient, 'execute'>, projectId: string) {
  const projects = await database.execute<RecentProject[]>('projects.list', {})
  const project = projects.find((p) => p.id === projectId)
  if (
    !project ||
    project.managed ||
    (await realpath(project.path).catch(() => null)) !== project.path
  )
    throw new ContractError(failure('PROJECT_UNAVAILABLE'))
  return ReadOnlyToolbox.create(project.path, new AbortController().signal)
}
