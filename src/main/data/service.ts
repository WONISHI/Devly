import { ScheduleRuntime } from '../schedules/runtime'
import { PreviewService } from '../preview/service'
import { WorkspaceService } from '../extensions/workspaces'
import { ConfigurationService, type ConfigPrompts } from './configuration'
import { stat, writeFile, rename, unlink, mkdir, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  operationArgs,
  operationResults,
  type DataOperation,
  type RecentProject,
  type Session,
} from '../../shared/data-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { ToolFailure, redactToolText } from '../agent/tools'
import type { DatabaseClient } from './client'
import type { CredentialVault } from './vault'
import { ProviderRuntime } from '../providers/runtime'
import { AccountUsageRuntime } from '../providers/account-usage'
import { ChatRuntime } from '../chat/runtime'
import { EditorService } from '../editor/service'
import { GitService } from '../git/service'
import { TerminalService } from '../terminal/service'

type Prompts = ConfigPrompts & {
  project?(): Promise<string | null>
  credential(): Promise<string | null>
  file(): Promise<string | null>
  export?(): Promise<string | null>
  backup?(): Promise<string | null>
  restore?(): Promise<string | null>
}
export class LocalDataService {
  private restorePreviews = new Map<
    string,
    { owner: string; path: string; digest: string; expires: number }
  >()
  readonly schedules: ScheduleRuntime
  readonly preview: PreviewService
  private workspaces: WorkspaceService
  private configuration: ConfigurationService
  private storageBusy = false
  private promptingCredential = false
  private providers: ProviderRuntime
  private chats: ChatRuntime
  private accounts: AccountUsageRuntime
  private editor: EditorService
  private git: GitService
  private terminals: TerminalService
  constructor(
    private database: DatabaseClient,
    private vault: CredentialVault,
    private prompts: Prompts,
  ) {
    this.preview = new PreviewService(database)
    this.configuration = new ConfigurationService(database, prompts)
    this.providers = new ProviderRuntime(database, vault)
    this.chats = new ChatRuntime(database, vault)
    this.schedules = new ScheduleRuntime(database, this.chats)
    this.schedules.setGuard(() => !this.storageBusy)
    this.chats.browser.setPreviewResolver((id) => this.preview.status(id)?.url ?? null)
    this.workspaces = new WorkspaceService(database, (id) => this.chats.projectActive(id))
    this.accounts = new AccountUsageRuntime(database, vault)
    this.editor = new EditorService(database)
    this.git = new GitService(database)
    this.terminals = new TerminalService(database)
  }
  clearOwner(owner: string): void {
    for (const [id, preview] of this.restorePreviews)
      if (preview.owner === owner) this.restorePreviews.delete(id)
    void this.preview.clearOwner(owner)
    this.configuration.clearOwner(owner)
    this.chats.web.clearOwner(owner)
    this.chats.clearOwner(owner)
    this.chats.mcp.clearOwner(owner)
    this.providers.clearOwner(owner)
    this.accounts.clearOwner(owner)
    this.editor.release(owner)
    void this.terminals.clearOwner(owner)
  }
  async close(): Promise<void> {
    await this.schedules.close()
    await this.preview.close()
    this.providers.close()
    this.accounts.close()
    await this.chats.close()
    await this.editor.close()
    await this.git.close()
    await this.terminals.close()
  }
  async initialize(): Promise<void> {
    await this.database.ready
    await this.chats.initialize()
    await this.vault.initialize()
    await this.vault.reconcile(await this.database.execute<string[]>('internal.credential.refs'))
    await this.schedules.initialize()
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
    if (operation.startsWith('schedules.')) {
      if (operation === 'schedules.save') {
        const provider = await this.database.execute<{ credentialRef: string | null }>(
          'internal.provider.config',
          { providerId: args.providerId },
        )
        const secret = provider.credentialRef ? await this.vault.read(provider.credentialRef) : ''
        const content = JSON.stringify({ name: args.name, prompt: args.prompt })
        if (redactToolText(content, secret) !== content)
          throw new ContractError({
            ...failure('INVALID_REQUEST'),
            message: '任务内容包含凭据，请移除后再保存',
          })
      }
      return {
        operation,
        data: operationResults[operation].parse(await this.schedules.execute(operation, args)),
      }
    }
    if (operation.startsWith('preview.')) {
      await this.database.execute('projects.list', {})
      try {
        data =
          operation === 'preview.start'
            ? await this.preview.start(String(args.projectId), String(args.entry), owner, isActive)
            : operation === 'preview.stop'
              ? await this.preview.stop(String(args.projectId))
              : this.preview.status(String(args.projectId))
      } catch {
        throw new ContractError({
          ...failure('INVALID_REQUEST'),
          message:
            '预览未启动或已停止；请选择项目内可读 HTML，检查文件/端口/权限。不会执行项目命令',
        })
      }
      return { operation, data: operationResults[operation].parse(data) }
    } else if (operation === 'attachments.import') {
      if (args.sessionId)
        await this.database.execute('sessions.get', {
          projectId: args.projectId,
          sessionId: args.sessionId,
        })
      const path = await this.prompts.file()
      if (!path) return { operation, data: null }
      if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
      try {
        data = await this.database.execute('internal.attachments.import', {
          ...args,
          sourcePath: path,
        })
      } catch (error) {
        if (error instanceof ContractError && error.info.code === 'LIMIT_EXCEEDED') throw error
        throw new ContractError({
          ...failure('INVALID_REQUEST'),
          message:
            '附件未导入：仅支持 UTF-8 文本（128 KiB）或 PNG/JPEG/WebP（2 MiB、1600 万像素）；不接受秘密文件或无效格式',
        })
      }
      return { operation, data: operationResults[operation].parse(data) }
    } else if (operation === 'web.save') {
      this.chats.web.clearProject(String(args.projectId))
      await this.chats.browser.clearProject(String(args.projectId))
      data = await this.database.execute(operation, args)
      this.chats.web.clearProject(String(args.projectId))
      await this.chats.browser.clearProject(String(args.projectId))
      return { operation, data: operationResults[operation].parse(data) }
    } else if (operation === 'web.credentials.set' || operation === 'web.credentials.clear') {
      this.chats.web.clearProject(String(args.projectId))
      await this.chats.browser.clearProject(String(args.projectId))
      if (this.promptingCredential) throw new ContractError(failure('LIMIT_EXCEEDED'))
      const previous = await this.database.execute<string | null>('internal.web.ref', args)
      if (operation === 'web.credentials.clear') {
        await this.database.execute('internal.web.ref', { ...args, ref: null })
        await this.vault.remove(previous)
        data = { removed: previous !== null }
      } else {
        this.promptingCredential = true
        let secret = '',
          reference: string | null = null
        try {
          if (!this.vault.available()) throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
          const input = await this.prompts.credential()
          if (input === null) return { operation, data: { saved: false } }
          secret = input
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          reference = await this.vault.put(secret)
          secret = ''
          await this.database.execute('internal.web.ref', { ...args, ref: reference })
          await this.vault.remove(previous)
          data = { saved: true }
        } catch (error) {
          if (
            reference &&
            (await this.database.execute('internal.web.ref', args).catch(() => null)) !== reference
          )
            await this.vault.remove(reference)
          throw error
        } finally {
          secret = ''
          this.promptingCredential = false
        }
      }
      this.chats.web.clearProject(String(args.projectId))
      await this.chats.browser.clearProject(String(args.projectId))
      return { operation, data: operationResults[operation].parse(data) }
    } else if (operation === 'web.test') {
      try {
        data = await this.chats.web.search(
          String(args.projectId),
          { query: args.query, count: 3 },
          AbortSignal.timeout(20000),
          undefined,
          owner,
        )
      } catch (error) {
        throw new ContractError({
          ...failure('TRANSPORT_ERROR'),
          message:
            error instanceof ToolFailure
              ? `搜索未完成：${error.code}；请检查开关、独立凭据、地址或限流状态`
              : '搜索网络或响应格式不可用；未自动重试',
        })
      }
      return { operation, data: operationResults[operation].parse(data) }
    } else if (
      operation === 'storage.backup' ||
      operation === 'storage.restore.inspect' ||
      operation === 'storage.restore.stage'
    ) {
      if (this.storageBusy) throw new ContractError(failure('LIMIT_EXCEEDED'))
      this.storageBusy = true
      try {
        if (operation === 'storage.backup') {
          const path = await this.prompts.backup?.()
          if (!path) return { operation, data: null }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          data = await this.database.execute('internal.storage.backup', { path })
        } else if (operation === 'storage.restore.inspect') {
          const path = await this.prompts.restore?.()
          if (!path) return { operation, data: null }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          const summary = await this.database.execute<{ digest: string }>(
            'internal.storage.inspect',
            { path },
          )
          const previewId = randomUUID()
          for (const [id, preview] of this.restorePreviews)
            if (preview.expires < Date.now() || preview.owner === owner)
              this.restorePreviews.delete(id)
          if (this.restorePreviews.size >= 8) throw new ContractError(failure('LIMIT_EXCEEDED'))
          this.restorePreviews.set(previewId, {
            path,
            owner,
            digest: summary.digest,
            expires: Date.now() + 300000,
          })
          data = { previewId, summary }
        } else {
          const preview = this.restorePreviews.get(String(args.previewId))
          if (
            !preview ||
            preview.owner !== owner ||
            preview.digest !== args.digest ||
            preview.expires < Date.now()
          )
            throw new ContractError(failure('INVALID_REQUEST'))
          if (this.chats.hasActive()) throw new ContractError(failure('CHAT_BUSY'))
          data = await this.database.execute('internal.storage.stage', {
            path: preview.path,
            digest: preview.digest,
          })
          this.restorePreviews.delete(String(args.previewId))
        }
        return { operation, data: operationResults[operation].parse(data) }
      } catch (error) {
        if (error instanceof ContractError) throw error
        throw new ContractError(failure('STORAGE_UNAVAILABLE'))
      } finally {
        this.storageBusy = false
      }
    }

    if (operation === 'skills.discover') {
      data = await this.chats.skills.discover(String(args.projectId))
    } else if (operation === 'skills.read') {
      data = await this.chats.skills.read(String(args.projectId), String(args.path))
    } else if (operation === 'skills.select') {
      data = await this.chats.skills.select(String(args.projectId), args.entries as never)
    } else if (
      operation === 'mcp.credentials.set' ||
      operation === 'mcp.credentials.clear' ||
      operation === 'mcp.remove'
    ) {
      const previous = await this.database.execute<string | null>('internal.mcp.ref', args)
      this.chats.mcp.clearServer(String(args.serverId))
      if (operation === 'mcp.credentials.set') {
        if (this.promptingCredential) throw new ContractError(failure('LIMIT_EXCEEDED'))
        this.promptingCredential = true
        let secret: string | null = null,
          reference: string | null = null
        try {
          if (!this.vault.available()) throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
          secret = await this.prompts.credential()
          if (secret === null) return { operation, data: { saved: false } }
          if (!isActive()) throw new ContractError(failure('FORBIDDEN'))
          reference = await this.vault.put(secret)
          secret = ''
          await this.database.execute('internal.mcp.ref', { ...args, ref: reference })
          await this.vault.remove(previous)
          data = { saved: true }
        } catch (error) {
          if (reference) {
            const current = await this.database
              .execute<string | null>('internal.mcp.ref', args)
              .catch(() => null)
            if (current !== reference) await this.vault.remove(reference)
          }
          throw error
        } finally {
          secret = ''
          this.promptingCredential = false
        }
      } else {
        if (operation === 'mcp.remove') data = await this.database.execute(operation, args)
        else {
          await this.database.execute('internal.mcp.ref', { ...args, ref: null })
          data = { removed: previous !== null }
        }
        await this.vault.remove(previous)
      }
    } else if (operation === 'mcp.connect') {
      data = await this.chats.mcp.test(String(args.projectId), String(args.serverId), owner)
    } else if (operation === 'mcp.save') {
      if (args.id) this.chats.mcp.clearServer(String(args.id))
      data = await this.database.execute(operation, args)
    } else if (operation === 'tasks.start') {
      const storage = await this.database.execute<{ pendingRestore: boolean }>('storage.status', {})
      if (this.storageBusy || storage.pendingRestore)
        throw new ContractError(failure('STORAGE_UNAVAILABLE'))
      let projectId = String(args.projectId)
      if (args.workspaceId) {
        const workspaces = await this.database.execute<
          { id: string; state: string; workspaceProjectId: string | null }[]
        >('internal.workspace.list', { projectId })
        const workspace = workspaces.find((w) => w.id === args.workspaceId && w.state === 'ready')
        if (!workspace?.workspaceProjectId) throw new ContractError(failure('FORBIDDEN'))
        projectId = workspace.workspaceProjectId
      }
      const session = await this.database.execute<Session>('sessions.create', {
        projectId,
        title: String(args.text).slice(0, 80),
      })
      await this.database.execute('sessions.bind', {
        projectId,
        sessionId: session.id,
        providerId: args.providerId,
        model: args.model,
      })
      data = await this.chats.execute(
        'chat.start',
        {
          projectId,
          sessionId: session.id,
          turnId: randomUUID(),
          text: args.text,
          expectedProviderId: args.providerId,
          expectedModel: args.model,
          mode: args.mode,
          selectedPaths: [],
          allowDelegation: args.allowDelegation,
        },
        isActive,
        owner,
      )
    } else if (operation.startsWith('workspaces.')) {
      data = await this.workspaces.execute(operation, args, isActive)
    } else if (operation.startsWith('config.') || operation === 'diagnostics.export') {
      data = await this.configuration.execute(operation, args, owner, isActive)
    } else if (operation.startsWith('terminal.')) {
      data = await this.terminals.execute(operation, args, owner, isActive)
    } else if (operation.startsWith('git.')) {
      data = await this.git.execute(operation, args, isActive)
    } else if (operation.startsWith('editor.')) {
      data = await this.editor.execute(operation, args, owner, isActive)
    } else if (operation.startsWith('chat.')) {
      if (operation === 'chat.start' || operation === 'chat.recovery.continue') {
        const storage = await this.database.execute<{ pendingRestore: boolean }>(
          'storage.status',
          {},
        )
        if (this.storageBusy || storage.pendingRestore)
          throw new ContractError(failure('STORAGE_UNAVAILABLE'))
      }
      data = await this.chats.execute(operation, args, isActive, owner)
    } else if (operation.startsWith('providers.probe.')) {
      data = await this.providers.execute(operation, args, owner, isActive)
    } else
      switch (operation) {
        case 'storage.reopen': {
          data = { reopened: false }
          break
        }
        case 'usage.account.cancel': {
          data = this.accounts.cancel(owner, String(args.providerId))
          break
        }
        case 'usage.account': {
          data = await this.accounts.query(String(args.providerId), owner, isActive)
          break
        }
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
            this.accounts.clearProvider(String(args.id))
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
              this.accounts.clearProvider(providerId)
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
          this.accounts.clearProvider(String(args.providerId))
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
          this.accounts.clearProvider(String(args.providerId))
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
