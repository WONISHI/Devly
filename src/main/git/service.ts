import { createHash } from 'node:crypto'
import type { DatabaseClient } from '../data/client'
import { projectTools } from '../editor/project'
import { gitRoot, readGit, parseStatus } from '../editor/git'
import { serializeMutation } from '../agent/execution-tools'
import { redactToolText } from '../agent/tools'
import { ContractError, failure } from '../../shared/contracts'
import type { GitSnapshot, GitCommit } from '../../shared/workbench-contracts'

export function parseCommits(bytes: Buffer): GitCommit[] {
  const parts = bytes.toString('utf8').split('\0'),
    result: GitCommit[] = []
  for (let i = 0; i + 4 < parts.length; i += 5) {
    const hash = parts[i].trim()
    if (!/^[a-f0-9]{40,64}$/.test(hash)) continue
    result.push({
      hash,
      author: redactToolText(parts[i + 1]),
      email: redactToolText(parts[i + 2]),
      timestamp: Number(parts[i + 3]) * 1000,
      subject: redactToolText(parts[i + 4]),
    })
  }
  return result
}
const format = '--format=%H%x00%an%x00%ae%x00%at%x00%s%x00'
const outcome = (
  code: 'ok' | 'stale' | 'dirty' | 'conflict' | 'denied' | 'failed' | 'unavailable',
  message: string,
  hash: string | null = null,
) => ({ ok: code === 'ok', code, message, hash })
export class GitService {
  private pending = new Set<Promise<unknown>>()
  private closing = false
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  async close() {
    this.closing = true
    await Promise.allSettled([...this.pending])
  }
  async execute(
    operation: string,
    args: Record<string, unknown>,
    active: () => boolean,
  ): Promise<unknown> {
    if (this.closing || !active()) throw new ContractError(failure('FORBIDDEN'))
    const toolbox = await projectTools(this.database, String(args.projectId)),
      root = await gitRoot(toolbox.root)
    const unavailable: GitSnapshot = {
      available: false,
      writable: false,
      reason: !root ? 'non_git' : process.platform !== 'darwin' ? 'unsupported' : 'unavailable',
      head: null,
      branch: null,
      branches: [],
      changes: [],
      staged: [],
      token: '',
      author: '',
      email: '',
      conflicts: false,
      truncated: false,
    }
    if (root && root !== toolbox.root) unavailable.reason = 'subdirectory'
    if (!root || root !== toolbox.root || process.platform !== 'darwin') {
      if (operation === 'git.snapshot') return unavailable
      if (operation === 'git.history') return { commits: [], next: null, available: false }
      if (operation === 'git.details') throw new ContractError(failure('NOT_FOUND'))
      return outcome('unavailable', '当前项目或平台的 Git 服务不可用')
    }
    const run = (args: string[], writable = false, input?: string) =>
      readGit(root, toolbox.root, args, 1048576, writable, input)
    const text = async (args: string[]) => {
      const r = await run(args)
      return r.code === 0 ? r.bytes.toString('utf8').trim() : ''
    }
    const snapshot = async (): Promise<GitSnapshot> => {
      try {
        const status = await run([
          'status',
          '--porcelain=v1',
          '-z',
          '--untracked-files=all',
          '--',
          '.',
        ])
        if (status.code !== 0) return unavailable
        const all = parseStatus(status.bytes),
          changes = []
        for (const change of all.slice(0, 1000))
          if (await toolbox.pathAllowed(change.path)) changes.push(change)
        const [head, branch, refs, index, names, author, email] = await Promise.all([
          text(['rev-parse', '--verify', 'HEAD']),
          text(['symbolic-ref', '--quiet', '--short', 'HEAD']),
          text(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']),
          run(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--raw', '--no-abbrev', '-z']),
          run(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '-z']),
          text(['config', '--local', '--get', 'user.name']),
          text(['config', '--local', '--get', 'user.email']),
        ])
        if (index.code !== 0 || names.code !== 0) return unavailable
        const staged = names.bytes.toString('utf8').split('\0').filter(Boolean)
        const token = createHash('sha256')
          .update(head)
          .update(status.bytes)
          .update(index.bytes)
          .digest('hex')
        const truncated =
          all.length > 1000 || staged.length > 1000 || refs.split('\n').length > 1000
        return {
          available: true,
          writable: root === toolbox.root && !truncated,
          reason: root === toolbox.root ? 'ready' : 'subdirectory',
          head: head || null,
          branch: branch || null,
          branches: refs ? refs.split('\n').slice(0, 1000) : [],
          changes,
          staged: staged.slice(0, 1000),
          token,
          author: redactToolText(author),
          email: redactToolText(email),
          conflicts: all.some((c) => c.kind === 'unmerged'),
          truncated,
        }
      } catch {
        return unavailable
      }
    }
    if (operation === 'git.snapshot') return snapshot()
    if (operation === 'git.history') {
      const current = await snapshot()
      if (!current.available || !current.head)
        return { commits: [], next: null, available: current.available }
      let revision = 'HEAD'
      if (args.before) {
        const parent = await text(['rev-parse', '--verify', `${String(args.before)}^`])
        if (!parent) return { commits: [], next: null, available: true }
        revision = parent
      }
      const result = await run(['log', '--first-parent', '-31', format, revision, '--', '.'])
      if (result.code !== 0) return { commits: [], next: null, available: false }
      const commits = parseCommits(result.bytes)
      return {
        commits: commits.slice(0, 30),
        next: commits.length > 30 ? commits[29].hash : null,
        available: true,
      }
    }
    if (operation === 'git.details') {
      const hash = String(args.hash),
        meta = await run(['show', '-s', format, hash]),
        commit = parseCommits(meta.bytes)[0]
      if (meta.code !== 0 || !commit) throw new ContractError(failure('NOT_FOUND'))
      const parent = await text(['rev-parse', '--verify', `${hash}^`])
      const base = parent
        ? ['diff', parent, hash]
        : ['diff-tree', '--root', '--no-commit-id', '-r', hash]
      const names = await run([
        ...base,
        '--no-ext-diff',
        '--no-textconv',
        '--name-status',
        '-z',
        '-M',
        '--',
        '.',
      ])
      const nums = await run([
        ...base,
        '--no-ext-diff',
        '--no-textconv',
        '--numstat',
        '-z',
        '-M',
        '--',
        '.',
      ])
      if (names.code || nums.code) throw new ContractError(failure('STORAGE_UNAVAILABLE'))
      const counts = new Map<string, { additions: number | null; deletions: number | null }>(),
        fields = nums.bytes.toString('utf8').split('\0')
      for (let i = 0; i < fields.length; i++) {
        const match = /^([^\t]+)\t([^\t]+)\t(.*)$/s.exec(fields[i])
        if (!match) continue
        let path = match[3]
        if (!path) {
          i++
          path = fields[++i]
        }
        counts.set(path, {
          additions: match[1] === '-' ? null : Number(match[1]),
          deletions: match[2] === '-' ? null : Number(match[2]),
        })
      }
      const fields2 = names.bytes.toString('utf8').split('\0'),
        files = []
      let seen = 0
      for (let i = 0; i + 1 < fields2.length;) {
        const status = fields2[i++],
          first = fields2[i++],
          renamed = /^[RC]/.test(status),
          path = renamed ? fields2[i++] : first
        if (!path) continue
        seen++
        if (
          files.length >= 1000 ||
          !(await toolbox.pathAllowed(path)) ||
          (renamed && !(await toolbox.pathAllowed(first)))
        )
          continue
        files.push({
          path,
          oldPath: renamed ? first : null,
          status: renamed
            ? 'renamed'
            : status === 'A'
              ? 'added'
              : status === 'D'
                ? 'deleted'
                : 'modified',
          ...(counts.get(path) ?? { additions: null, deletions: null }),
        })
      }
      return { commit, files, truncated: seen > 1000 }
    }
    const task = serializeMutation(root, new AbortController().signal, async () => {
      if (
        !active() ||
        this.closing ||
        (await projectTools(this.database, String(args.projectId))).root !== toolbox.root
      )
        return outcome('unavailable', '项目或窗口已变化，请重新读取')
      const before = await snapshot()
      if (!before.writable)
        return outcome('unavailable', '请打开仓库根目录；超限或不可用仓库不能执行写操作')
      if (args.token !== before.token) return outcome('stale', 'Git 状态已改变，请刷新后重新审查')
      if (before.conflicts) return outcome('conflict', '仓库存在未解决冲突，请先在项目中处理')
      // Disable configured clean/smudge/process filters as well as hooks/signing. No external filter programs.
      const filters = await text([
        'config',
        '--local',
        '--name-only',
        '--get-regexp',
        '^filter\\..*\\.(clean|smudge|process|required)$',
      ])
      const safe: string[] = []
      for (const name of new Set(
        filters
          .split('\n')
          .filter(Boolean)
          .map((v) => v.split('.').slice(1, -1).join('.')),
      )) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return outcome('denied', '不支持此仓库的过滤器配置')
        safe.push(
          '-c',
          `filter.${name}.clean=/bin/cat`,
          '-c',
          `filter.${name}.smudge=/bin/cat`,
          '-c',
          `filter.${name}.process=`,
          '-c',
          `filter.${name}.required=false`,
        )
      }
      if (operation === 'git.stage') {
        const paths = new Set<string>()
        for (const path of args.paths as string[]) {
          const change = before.changes.find((c) => c.path === path)
          if (
            !change ||
            !(await toolbox.pathAllowed(path)) ||
            (change.oldPath && !(await toolbox.pathAllowed(change.oldPath)))
          )
            return outcome('denied', '所选路径不在当前可操作范围')
          paths.add(path)
          if (change.oldPath) paths.add(change.oldPath)
        }
        const list = [...paths].join('\0') + '\0'
        const cmd = args.staged
          ? ['add', '--pathspec-from-file=-', '--pathspec-file-nul']
          : before.head
            ? ['reset', '-q', 'HEAD', '--pathspec-from-file=-', '--pathspec-file-nul']
            : [
                'rm',
                '--cached',
                '--ignore-unmatch',
                '--pathspec-from-file=-',
                '--pathspec-file-nul',
              ]
        const result = await run([...safe, ...cmd], true, list)
        return result.code === 0
          ? outcome('ok', args.staged ? '已暂存所选文件的磁盘版本' : '已取消暂存，工作区内容保留')
          : outcome('failed', 'Git 暂存操作失败；请刷新检查 index.lock、路径或权限')
      }
      if (operation === 'git.commit') {
        if (!before.staged.length) return outcome('denied', '没有已暂存文件')
        for (const path of before.staged)
          if (!(await toolbox.pathAllowed(path)))
            return outcome('denied', '暂存区包含受保护或未展示的路径，未创建提交')
        const result = await run(
          [
            ...safe,
            '-c',
            `user.name=${String(args.author)}`,
            '-c',
            `user.email=${String(args.email)}`,
            'commit',
            '--no-verify',
            '--no-gpg-sign',
            '-m',
            String(args.message),
          ],
          true,
        )
        if (result.code !== 0)
          return outcome('failed', '本地提交失败，请刷新核对暂存区；未自动重试')
        return outcome('ok', '已创建本地提交，未推送', await text(['rev-parse', 'HEAD']))
      }
      if (operation === 'git.branch') {
        const name = String(args.name)
        if ((await run(['check-ref-format', '--branch', name])).code !== 0)
          return outcome('denied', '分支名称无效')
        const dirty = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
        if (dirty.code !== 0) return outcome('unavailable', '无法确认工作区状态')
        if (args.action !== 'delete' && dirty.bytes.length)
          return outcome(
            'dirty',
            '工作区或暂存区有更改（含隐藏保护路径），请先处理；不会自动丢弃或 stash',
          )
        if (!before.head) return outcome('denied', '请先创建初始提交')
        if (args.action === 'delete' && name === before.branch)
          return outcome('denied', '不能删除当前分支')
        const command =
          args.action === 'create'
            ? ['switch', '-c', name]
            : args.action === 'switch'
              ? ['switch', name]
              : ['branch', '-d', '--', name]
        const result = await run([...safe, ...command], true)
        return result.code === 0
          ? outcome('ok', '分支操作完成')
          : outcome('failed', '分支操作失败：名称、未合并提交、冲突或本地约束；未丢弃修改')
      }
      throw new ContractError(failure('INVALID_REQUEST'))
    })
    this.pending.add(task)
    try {
      return await task
    } finally {
      this.pending.delete(task)
    }
  }
}
