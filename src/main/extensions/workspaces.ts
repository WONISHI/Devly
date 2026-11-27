import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { DatabaseClient } from '../data/client'
import type { RecentProject, Settings } from '../../shared/data-contracts'
import type { ManagedWorkspace } from '../../shared/extension-contracts'
import { readGit, gitRoot, parseStatus } from '../editor/git'
import { serializeMutation } from '../agent/execution-tools'
import { ReadOnlyToolbox, redactToolText } from '../agent/tools'
import { ContractError, failure } from '../../shared/contracts'
const denied = () => new ContractError(failure('FORBIDDEN'))
export class WorkspaceService {
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private activeProject: (id: string) => boolean,
  ) {}
  async execute(
    operation: string,
    args: Record<string, unknown>,
    active: () => boolean,
  ): Promise<unknown> {
    const projectId = String(args.projectId),
      projects = await this.database.execute<RecentProject[]>('projects.list', {}),
      project = projects.find((p) => p.id === projectId && !p.managed)
    if (!project || !active()) throw denied()
    if (operation === 'workspaces.list')
      return this.database.execute('internal.workspace.list', { projectId })
    const root = await realpath(project.path),
      metadata = join(root, '.git')
    if (
      root !== project.path ||
      (await gitRoot(root)) !== root ||
      !(await lstat(metadata)).isDirectory() ||
      (await lstat(metadata)).isSymbolicLink()
    )
      throw denied()
    const run = (input: string[], writable = false) => readGit(root, root, input, 1048576, writable)
    const text = async (input: string[]) => {
      const result = await run(input)
      if (result.code) throw new Error('GIT_FAILED')
      return result.bytes.toString('utf8').trim()
    }
    if (operation === 'workspaces.create')
      return serializeMutation(root, new AbortController().signal, async () => {
        if (!active()) throw denied()
        const id = randomUUID(),
          container = join(metadata, 'devly-workspaces'),
          path = join(container, id),
          branch = `devly/task-${id}`
        await mkdir(container, { recursive: true, mode: 0o700 })
        if ((await lstat(container)).isSymbolicLink() || (await realpath(container)) !== container)
          throw denied()
        const existing = await this.database.execute<ManagedWorkspace[]>(
          'internal.workspace.list',
          { projectId },
        )
        if (existing.length >= 100) throw new ContractError(failure('LIMIT_EXCEEDED'))
        const targetBranch = await text(['symbolic-ref', '--quiet', '--short', 'HEAD'])
        let base = await text(['rev-parse', '--verify', 'HEAD'])
        if (args.baseWorkspaceId) {
          const source = existing.find((w) => w.id === args.baseWorkspaceId && w.state === 'ready')
          if (
            !source ||
            source.path !== join(metadata, 'devly-workspaces', source.id) ||
            (await realpath(source.path).catch(() => null)) !== source.path
          )
            throw denied()
          const registered = await text(['worktree', 'list', '--porcelain'])
          if (
            !registered
              .split('\n\n')
              .some(
                (block) =>
                  block.includes(`worktree ${source.path}\n`) &&
                  block.includes(`branch refs/heads/${source.branch}`),
              )
          )
            throw denied()
          base = await text(['-C', source.path, 'rev-parse', '--verify', 'HEAD'])
        }
        const result = await run(['worktree', 'add', '-b', branch, '--', path, base], true)
        if (result.code) throw new Error('WORKTREE_CREATE_FAILED')
        // Register immediately; later initialization failure never silently removes files or commits.
        const workspace = await this.database.execute<ManagedWorkspace>('internal.workspace.save', {
          id,
          projectId,
          workspaceProjectId: null,
          path,
          branch,
          targetBranch,
          base,
          state: 'ready',
          createdAt: Date.now(),
        })
        const child = await this.database.execute<RecentProject>('internal.project.upsert', {
          path,
          activate: false,
        })
        const settings = await this.database.execute<Settings>('settings.get', { projectId })
        await this.database.execute('settings.save', { projectId: child.id, settings })
        return this.database.execute('internal.workspace.save', {
          ...workspace,
          workspaceProjectId: child.id,
        })
      })
    const entries = await this.database.execute<ManagedWorkspace[]>('internal.workspace.list', {
        projectId,
      }),
      workspace = entries.find((w) => w.id === args.workspaceId && w.state === 'ready')
    if (
      !workspace ||
      workspace.path !== join(metadata, 'devly-workspaces', workspace.id) ||
      (await realpath(workspace.path).catch(() => null)) !== workspace.path
    )
      throw denied()
    const registered = await text(['worktree', 'list', '--porcelain'])
    if (
      !registered
        .split('\n\n')
        .some(
          (block) =>
            block.includes(`worktree ${workspace.path}\n`) &&
            block.includes(`branch refs/heads/${workspace.branch}`),
        )
    )
      throw denied()
    const local = (input: string[], writable = false) =>
      run(['-C', workspace.path, ...input], writable)
    const review = async () => {
      const branchResult = await run(['symbolic-ref', '--quiet', '--short', 'HEAD'])
      const mainBranch = branchResult.code === 0 ? branchResult.bytes.toString('utf8').trim() : null
      const mainHead = await text(['rev-parse', '--verify', 'HEAD']),
        head = (await local(['rev-parse', '--verify', 'HEAD'])).bytes.toString('utf8').trim(),
        status = await local(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      if (status.code) throw new Error('WORKSPACE_UNAVAILABLE')
      const allChanges = parseStatus(status.bytes),
        preservedRecoveryFiles = allChanges
          .filter(
            (change) =>
              change.status === '??' && /(?:^|\/)\.devly-before-[a-f0-9-]{36}$/i.test(change.path),
          )
          .map((change) => change.path),
        changes = allChanges.filter((change) => !preservedRecoveryFiles.includes(change.path)),
        toolbox = await ReadOnlyToolbox.create(workspace.path, new AbortController().signal)
      if (allChanges.length > 200) throw new Error('DIFF_LIMIT')
      const files = await local([
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--name-only',
        '-z',
        workspace.base,
        '--',
        '.',
      ])
      const paths = [
        ...new Set([
          ...files.bytes.toString('utf8').split('\0').filter(Boolean),
          ...changes.flatMap((c) => [c.path, ...(c.oldPath ? [c.oldPath] : [])]),
        ]),
      ]
      if (paths.length > 200) throw new Error('DIFF_LIMIT')
      for (const path of paths) if (!(await toolbox.pathAllowed(path))) throw denied()
      const diff = paths.length
        ? await local(['diff', '--no-ext-diff', '--no-textconv', workspace.base, '--', ...paths])
        : { code: 0, bytes: Buffer.alloc(0) }
      if (diff.code) throw new Error('DIFF_FAILED')
      const token = createHash('sha256')
        .update(mainHead)
        .update(mainBranch ?? '')
        .update(head)
        .update(status.bytes)
        .update(diff.bytes)
      // Untracked content participates in review; no name-only token for later staging.
      const previews = []
      for (const change of changes.filter((c) => c.status === '??')) {
        const doc = await toolbox.document(change.path)
        if (doc.text === null) throw denied()
        token.update(change.path).update(doc.text)
        previews.push(`New file ${change.path}\n${doc.text}`)
      }
      return {
        workspace,
        mainHead,
        mainBranch,
        head,
        dirty: changes.length > 0,
        conflicts: changes.some((c) => c.kind === 'unmerged'),
        paths,
        preservedRecoveryFiles,
        diff: redactToolText(diff.bytes.toString('utf8') + '\n' + previews.join('\n')).slice(
          0,
          100000,
        ),
        token: token.digest('hex'),
      }
    }
    if (operation === 'workspaces.review') return review()
    return serializeMutation(root, new AbortController().signal, async () => {
      const current = await review()
      if (!active() || current.token !== args.token)
        return { ok: false, code: 'stale', message: '文件或分支已变化，请重新审查' }
      if (workspace.workspaceProjectId && this.activeProject(workspace.workspaceProjectId))
        return { ok: false, code: 'busy', message: '请先停止该工作区的全部任务' }
      if (operation === 'workspaces.remove') {
        if (current.preservedRecoveryFiles.length)
          return {
            ok: false,
            code: 'recovery_present',
            message: '保留着补丁前的恢复副本，未删除工作区；请先手动妥善保存这些副本再重新审查关闭',
          }
        if (current.dirty)
          return { ok: false, code: 'dirty', message: '存在未提交内容，未清理工作区' }
        const result = await run(['worktree', 'remove', '--', workspace.path], true)
        if (result.code)
          return { ok: false, code: 'failed', message: 'Git 拒绝关闭，工作区与分支保留' }
        await this.database.execute('internal.workspace.save', { ...workspace, state: 'closed' })

        return { ok: true, code: 'ok', message: '已关闭干净工作区；任务分支保留' }
      }
      if (current.conflicts)
        return { ok: false, code: 'conflict', message: '工作区有未解决冲突，请人工处理后重新审查' }
      if (operation === 'workspaces.commit') {
        if (!current.dirty) return { ok: false, code: 'clean', message: '工作区没有待提交内容' }
        const filters = await run(['config', '--local', '--get-regexp', '^filter\\.'])
        if (filters.bytes.length)
          return { ok: false, code: 'denied', message: '仓库配置了外部过滤器，当前不执行自动暂存' }
        if (
          (await local(['add', '--', ...current.paths], true)).code ||
          (await local(['commit', '--no-verify', '-m', String(args.message)], true)).code
        )
          return {
            ok: false,
            code: 'failed',
            message: '提交未完成，请检查身份/索引后重新审查；已有文件保留',
          }
        return { ok: true, code: 'ok', message: '已提交审查范围中的任务文件，没有推送' }
      }
      if (!workspace.targetBranch || current.mainBranch !== workspace.targetBranch)
        return {
          ok: false,
          code: 'branch_changed',
          message: '主目录已切换到其他分支，未合并；请切回创建时绑定的目标分支后重新审查',
        }
      const mainStatus = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      if (current.dirty || mainStatus.code || mainStatus.bytes.length)
        return { ok: false, code: 'dirty', message: '主工作区或任务区有未提交内容，未合并' }
      const ancestor = await run(['merge-base', '--is-ancestor', current.mainHead, current.head])
      if (ancestor.code)
        return {
          ok: false,
          code: 'diverged',
          message: '分支已分叉，未执行合并；请人工解决冲突/变基后重新审查',
        }
      const result = await run(['merge', '--ff-only', '--no-edit', workspace.branch], true)
      return {
        ok: result.code === 0,
        code: result.code === 0 ? 'ok' : 'conflict',
        message:
          result.code === 0
            ? '已快进合并任务提交；分支与工作区保留'
            : '合并未完成，请检查当前状态；未自动重置',
      }
    })
  }
}
