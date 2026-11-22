import { stat, writeFile, rename, unlink, mkdir, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  operationArgs,
  operationResults,
  type DataOperation,
  type RecentProject,
} from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import type { DatabaseClient } from './client'
import type { CredentialVault } from './vault'
import { ProviderRuntime } from '../providers/runtime'
import { ChatRuntime } from '../chat/runtime'

type Prompts = {
  project?(): Promise<string | null>
  credential(): Promise<string | null>
  file(): Promise<string | null>
  export?(): Promise<string | null>
}
export class LocalDataService {
  private promptingCredential = false
  private providers: ProviderRuntime
  private chats: ChatRuntime
  constructor(
    private database: DatabaseClient,
    private vault: CredentialVault,
    private prompts: Prompts,
  ) {
    this.providers = new ProviderRuntime(database, vault)
    this.chats = new ChatRuntime(database, vault)
  }
  clearOwner(owner: string): void {
    this.providers.clearOwner(owner)
  }
  async close(): Promise<void> {
    this.providers.close()
    await this.chats.close()
  }
  async initialize(): Promise<void> {
    await this.database.ready
    await this.chats.initialize()
    await this.vault.initialize()
    await this.vault.reconcile(await this.database.execute<string[]>('internal.credential.refs'))
  }
  async execute(
    payload: { operation: string; args: unknown },
    isActive: () => boolean,
    owner = 'local',
  ): Promise<{ operation: string; data: unknown }> {
    if (!(payload.operation in operationArgs)) throw new ContractError(failure('INVALID_REQUEST'))
    const operation = payload.operation as DataOperation
    const args = operationArgs[operation].parse(payload.args) as Record<string, unknown>
    if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
    let data: unknown
    if (operation.startsWith('chat.')) {
      data = await this.chats.execute(operation, args, isActive)
    } else if (operation.startsWith('providers.probe.')) {
      data = await this.providers.execute(operation, args, owner, isActive)
    } else
      switch (operation) {
        case 'projects.create': {
          const path = await this.prompts.project?.()
          if (!path) {
            data = null
            break
          }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          try {
            await mkdir(path, { recursive: false })
          } catch {
            throw new ContractError(failure('PROJECT_UNAVAILABLE'))
          }
          data = await this.database.execute('internal.project.upsert', {
            path: await realpath(path),
          })
          break
        }
        case 'providers.save': {
          if (args.id) {
            this.providers.clearProvider(String(args.id))
            this.chats.clearProvider(String(args.id))
          }
          data = await this.database.execute(operation, args)
          break
        }
        case 'settings.export': {
          const path = await this.prompts.export?.()
          if (!path) {
            data = { saved: false }
            break
          }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          const settings = await this.database.execute('settings.get', args)
          const temporary = join(dirname(path), `.devly-settings-${randomUUID()}.tmp`)
          try {
            await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n', {
              flag: 'wx',
              mode: 0o600,
              flush: true,
            })
            await rename(temporary, path)
          } catch {
            await unlink(temporary).catch(() => {})
            throw new ContractError(failure('STORAGE_UNAVAILABLE'))
          }
          data = { saved: true }
          break
        }
        case 'credentials.set': {
          if (this.promptingCredential) throw new ContractError(failure('LIMIT_EXCEEDED'))
          this.promptingCredential = true
          try {
            const providerId = String(args.providerId)
            await this.database.execute('internal.credential.ref', { providerId })
            if (!this.vault.available()) throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
            let secret = await this.prompts.credential()
            if (secret === null) {
              data = { saved: false }
              break
            }
            if (!isActive()) {
              secret = ''
              throw new ContractError(failure('FORBIDDEN'))
            }
            let reference: string
            try {
              reference = await this.vault.put(secret)
            } finally {
              secret = ''
            }
            try {
              this.providers.clearProvider(providerId)
              this.chats.clearProvider(providerId)
              const previous = await this.database.execute<string | null>(
                'internal.credential.ref',
                {
                  providerId,
                  ref: reference,
                },
              )
              await this.vault.remove(previous)
            } catch {
              const current = await this.database
                .execute<string | null>('internal.credential.ref', { providerId })
                .catch(() => null)
              if (current !== reference) await this.vault.remove(reference)
              throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
            }
            data = { saved: true }
            break
          } finally {
            this.promptingCredential = false
          }
        }
        case 'credentials.clear': {
          this.providers.clearProvider(String(args.providerId))
          this.chats.clearProvider(String(args.providerId))
          const previous = await this.database.execute<string | null>('internal.credential.ref', {
            providerId: args.providerId,
            ref: null,
          })
          await this.vault.remove(previous)
          data = { removed: previous !== null }
          break
        }
        case 'providers.remove': {
          this.providers.clearProvider(String(args.providerId))
          this.chats.clearProvider(String(args.providerId))
          const previous = await this.database.execute<string | null>('internal.credential.ref', {
            providerId: args.providerId,
          })
          data = await this.database.execute(operation, args)
          await this.vault.remove(previous)
          break
        }
        case 'blobs.import': {
          await this.database.execute('sessions.get', {
            projectId: args.projectId,
            sessionId: args.sessionId,
          })
          const path = await this.prompts.file()
          if (!path) {
            data = null
            break
          }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          data = await this.database.execute('internal.blob.put', { ...args, sourcePath: path })
          break
        }
        default:
          if (operation === 'projects.remove') await this.chats.cancelScope(String(args.projectId))
          if (operation === 'sessions.archive' && args.archived)
            await this.chats.cancelScope(String(args.projectId), String(args.sessionId))
          data = await this.database.execute(operation, args)
      }
    if (operation === 'projects.list') data = await this.projects(data as RecentProject[])
    if (operation === 'bootstrap') {
      const result = data as {
        projects: RecentProject[]
        storage: { credentialAvailable: boolean }
      }
      data = {
        ...result,
        projects: await this.projects(result.projects),
        storage: { ...result.storage, credentialAvailable: this.vault.available() },
      }
    }
    const result = operationResults[operation].safeParse(data)
    if (!result.success) throw new ContractError(failure('INVALID_RESPONSE'))
    return { operation, data: result.data }
  }
  private async projects(projects: RecentProject[]): Promise<RecentProject[]> {
    return Promise.all(
      projects.map(async (project) => ({
        ...project,
        available: (await stat(project.path).catch(() => null))?.isDirectory() ?? false,
      })),
    )
  }
}
