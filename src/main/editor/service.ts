import { watch, type FSWatcher } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import type { DatabaseClient } from '../data/client'
import { ContractError, failure } from '../../shared/contracts'
import type { RecentProject } from '../../shared/data-contracts'
import { ReadOnlyToolbox, ToolFailure, redactToolText } from '../agent/tools'
import { serializeMutation } from '../agent/execution-tools'
import { applyIsolatedPatch } from '../agent/isolated-patch'
import { patchRequest } from '../agent/patch-executor'
import { projectChanges, projectDiff, unavailableDocument } from './git'
import type { ProjectDocument } from '../../shared/editor-contracts'

type Lease = {
  owner: string
  projectId: string
  paths: string[]
  revision: number
  degraded: boolean
  handles: FSWatcher[]
  identities: string[]
  timer?: ReturnType<typeof setTimeout>
}
export class EditorService {
  private leases = new Map<string, Lease>()
  private revision = 0
  private saves = new Set<Promise<unknown>>()
  private cancelledWatches = new Set<string>()
  private closing = false
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  release(owner: string, id?: string, remember = true) {
    if (id && remember) {
      this.cancelledWatches.add(`${owner}:${id}`)
      if (this.cancelledWatches.size > 256)
        this.cancelledWatches.delete(this.cancelledWatches.values().next().value!)
    }
    let removed = false
    for (const [key, lease] of this.leases)
      if (lease.owner === owner && (!id || key === id)) {
        for (const handle of lease.handles) handle.close()
        clearTimeout(lease.timer)
        this.leases.delete(key)
        removed = true
      }
    return { removed }
  }
  async close() {
    this.closing = true
    for (const lease of [...this.leases.values()]) this.release(lease.owner)
    await Promise.allSettled([...this.saves])
  }
  private async tools(projectId: string) {
    const projects = await this.database.execute<RecentProject[]>('projects.list', {})
    const project = projects.find((project) => project.id === projectId)
    if (
      !project ||
      project.managed ||
      (await realpath(project.path).catch(() => null)) !== project.path
    )
      throw new ContractError(failure('PROJECT_UNAVAILABLE'))
    return ReadOnlyToolbox.create(project.path, new AbortController().signal)
  }
  private async read(toolbox: ReadOnlyToolbox, path: string): Promise<ProjectDocument> {
    try {
      return { status: 'text', ...(await toolbox.document(path)) }
    } catch (error) {
      const code = error instanceof ToolFailure ? error.code : (error as NodeJS.ErrnoException).code
      return unavailableDocument(
        path,
        code === 'ENOENT'
          ? 'missing'
          : code === 'BINARY_FILE'
            ? 'binary'
            : code === 'FILE_TOO_LARGE'
              ? 'too_large'
              : code === 'INVALID_UTF8'
                ? 'encoding'
                : ['PATH_DENIED', 'SYMLINK_DENIED', 'IGNORED_PATH', 'SENSITIVE_CONTENT'].includes(
                      code ?? '',
                    )
                  ? 'denied'
                  : 'unavailable',
      )
    }
  }
  async execute(
    operation: string,
    args: Record<string, unknown>,
    owner: string,
    active: () => boolean,
  ): Promise<unknown> {
    if (operation === 'editor.release') return this.release(owner, String(args.watchId))
    if (this.closing) throw new ContractError(failure('FORBIDDEN'))
    const projectId = String(args.projectId),
      path = String(args.path ?? '.')
    const toolbox = await this.tools(projectId)
    if (!active() || this.closing) throw new ContractError(failure('FORBIDDEN'))
    if (operation === 'editor.list') {
      const result = await toolbox.execute(
        'list_files',
        JSON.stringify({ path, offset: args.offset ?? 0, limit: 100 }),
      )
      return { entries: result.entries, nextOffset: result.nextOffset }
    }
    if (operation === 'editor.read') return this.read(toolbox, path)
    if (operation === 'editor.changes') return projectChanges(toolbox)
    if (operation === 'editor.diff')
      return projectDiff(toolbox, path, await this.read(toolbox, path))
    if (operation === 'editor.save') {
      const request = patchRequest.parse({
        changes: [{ path, expectedHash: args.expectedHash, content: args.content }],
      })
      const task = serializeMutation(toolbox.root, new AbortController().signal, async () => {
        if (!active()) throw new ContractError(failure('FORBIDDEN'))
        if ((await this.tools(projectId)).root !== toolbox.root)
          throw new ContractError(failure('PROJECT_UNAVAILABLE'))
        const current = await this.read(toolbox, path)
        if (redactToolText(String(args.content)) !== args.content)
          return { saved: false, document: current, recoveryPath: null, error: 'denied' }
        if (current.status !== 'text')
          return {
            saved: false,
            document: current,
            recoveryPath: null,
            error: current.status === 'missing' ? 'missing' : 'denied',
          }
        if (current.version !== args.expectedHash)
          return { saved: false, document: current, recoveryPath: null, error: 'conflict' }
        try {
          const [result] = await applyIsolatedPatch(
            toolbox.root,
            request,
            new AbortController().signal,
          )
          const document = await this.read(toolbox, path)
          const saved = result.state === 'applied' && document.text === args.content
          return {
            saved,
            document,
            recoveryPath: result.recoveryPath ?? null,
            error: saved
              ? null
              : result.state === 'conflict' || result.state === 'applied'
                ? 'conflict'
                : 'unavailable',
          }
        } catch {
          return {
            saved: false,
            document: await this.read(toolbox, path),
            recoveryPath: null,
            error: 'unavailable',
          }
        }
      })
      this.saves.add(task)
      try {
        return await task
      } finally {
        this.saves.delete(task)
      }
    }
    if (operation === 'editor.observe') {
      const id = String(args.watchId),
        paths = [...new Set(['.', ...(args.paths as string[])])]
      if (this.cancelledWatches.has(`${owner}:${id}`)) throw new ContractError(failure('FORBIDDEN'))
      const existing = this.leases.get(id)
      if (existing && existing.owner !== owner) throw new ContractError(failure('FORBIDDEN'))
      if (
        !existing &&
        [...this.leases.values()].filter((lease) => lease.owner === owner).length >= 4
      )
        throw new ContractError(failure('LIMIT_EXCEEDED'))
      const checked: { path: string; identity: string }[] = []
      let degraded = false
      for (const path of paths)
        try {
          const safe = await toolbox.directoryPath(path),
            stat = await lstat(safe)
          checked.push({ path: safe, identity: `${stat.dev}:${stat.ino}` })
        } catch {
          degraded = true
        }
      const identities = checked.map((item) => item.identity)
      let lease = existing
      if (
        !lease ||
        lease.projectId !== projectId ||
        JSON.stringify(lease.paths) !== JSON.stringify(paths) ||
        JSON.stringify(lease.identities) !== JSON.stringify(identities)
      ) {
        this.release(owner, id, false)
        lease = {
          owner,
          projectId,
          paths,
          revision: ++this.revision,
          degraded,
          handles: [],
          identities,
        }
        this.leases.set(id, lease)
        const target = lease
        for (const item of checked)
          try {
            const handle = watch(item.path, () => {
              clearTimeout(target.timer)
              target.timer = setTimeout(() => {
                target.revision = ++this.revision
              }, 80)
            })
            handle.on('error', () => {
              target.degraded = true
              target.revision = ++this.revision
            })
            lease.handles.push(handle)
          } catch {
            lease.degraded = true
          }
      }
      if (!active() || this.closing || this.cancelledWatches.has(`${owner}:${id}`)) {
        this.release(owner, id)
        throw new ContractError(failure('FORBIDDEN'))
      }
      return { revision: lease.revision, watching: lease.handles.length, degraded: lease.degraded }
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
}
