import { supportsHostExecution, hostExecutionNotice } from '../../shared/host-support'
import type { IPty } from 'node-pty'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../data/client'
import { projectTools } from '../editor/project'
import { commandProfile } from '../agent/command-executor'
import { ContractError, failure } from '../../shared/contracts'
import type { TerminalInfo } from '../../shared/workbench-contracts'
const executeFile = promisify(execFile)
type Session = {
  info: TerminalInfo
  owner: string
  process: IPty
  text: string
  start: number
  end: number
  cleanup?: Promise<TerminalInfo>
}
export class TerminalService {
  private sessions = new Map<string, Session>()
  private closing = false
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  async clearOwner(owner: string) {
    await Promise.allSettled(
      [...this.sessions.values()].filter((s) => s.owner === owner).map((s) => this.stop(s)),
    )
  }
  async close() {
    this.closing = true
    await Promise.allSettled([...this.sessions.values()].map((s) => this.stop(s)))
  }
  private stop(session: Session): Promise<TerminalInfo> {
    if (session.cleanup) return session.cleanup
    if (session.info.state === 'exited') {
      this.sessions.delete(session.info.id)
      return Promise.resolve({ ...session.info })
    }
    const task = (async () => {
      session.info.state = 'closing'
      let ids: number[] = [session.process.pid],
        groups: number[] = [],
        identified = true
      try {
        const result = await executeFile('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat='], {
          timeout: 2000,
          maxBuffer: 1048576,
          env: { PATH: '/usr/bin:/bin' },
        })
        const rows = result.stdout
          .trim()
          .split('\n')
          .map((line) => line.trim().split(/\s+/))
          .map(([pid, parent, group, state]) => ({
            pid: Number(pid),
            parent: Number(parent),
            group: Number(group),
            state,
          }))
        const set = new Set(ids)
        for (let i = 0; i < rows.length; i++) {
          let changed = false
          for (const row of rows)
            if (set.has(row.parent) && !set.has(row.pid)) {
              set.add(row.pid)
              changed = true
            }
          if (!changed) break
        }
        ids = [...set]
        const mainGroup = rows.find((row) => row.pid === process.pid)?.group
        groups = [
          ...new Set(
            rows
              .filter((row) => set.has(row.pid) && row.group > 1 && row.group !== mainGroup)
              .map((row) => row.group),
          ),
        ]
      } catch {
        identified = false
        session.info.state = 'unknown'
      }
      const kill = (signal: NodeJS.Signals) => {
        for (const group of groups)
          try {
            process.kill(-group, signal)
          } catch {
            /* Final process inspection determines whether cleanup completed. */
          }
        for (const pid of ids)
          if (pid > 1 && pid !== process.pid)
            try {
              process.kill(pid, signal)
            } catch {
              /* The process may already have exited. */
            }
      }
      kill('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 150))
      kill('SIGKILL')
      try {
        session.process.kill('SIGKILL')
      } catch {
        /* The native PTY may already be closed. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      try {
        const result = await executeFile('/bin/ps', ['-axo', 'pid=,stat='], {
          timeout: 2000,
          maxBuffer: 1048576,
          env: { PATH: '/usr/bin:/bin' },
        })
        const alive = result.stdout.split('\n').some((line) => {
          const [pid, state] = line.trim().split(/\s+/)
          return ids.includes(Number(pid)) && !state?.startsWith('Z')
        })
        session.info.state = alive || !identified ? 'unknown' : 'exited'
      } catch {
        session.info.state = 'unknown'
      }
      const info = { ...session.info }
      if (info.state === 'exited') this.sessions.delete(info.id)
      return info
    })()
    session.cleanup = task
    return task
  }
  async execute(
    operation: string,
    args: Record<string, unknown>,
    owner: string,
    active: () => boolean,
  ): Promise<unknown> {
    if (this.closing || !active()) throw new ContractError(failure('FORBIDDEN'))
    const projectId = String(args.projectId)
    if (operation === 'terminal.list')
      return [...this.sessions.values()]
        .filter((s) => s.owner === owner && s.info.projectId === projectId)
        .map((s) => ({ ...s.info }))
    if (operation === 'terminal.create') {
      if (!supportsHostExecution(process.platform))
        throw new ContractError({
          ...failure('FORBIDDEN'),
          message: hostExecutionNotice(process.platform),
        })
      const toolbox = await projectTools(this.database, projectId)
      if (!active() || this.closing) throw new ContractError(failure('FORBIDDEN'))
      if (
        this.sessions.size >= 32 ||
        [...this.sessions.values()].filter((s) => s.owner === owner).length >= 8 ||
        [...this.sessions.values()].filter(
          (s) => s.owner === owner && s.info.projectId === projectId,
        ).length >= 4
      )
        throw new ContractError(failure('LIMIT_EXCEEDED'))
      const info: TerminalInfo = {
        id: randomUUID(),
        projectId,
        cwd: toolbox.root,
        state: 'running',
        exitCode: null,
        cols: Number(args.cols),
        rows: Number(args.rows),
      }
      let child: IPty
      try {
        const { spawn: spawnPty } = await import('node-pty')
        if (!active() || this.closing) throw new ContractError(failure('FORBIDDEN'))
        child = spawnPty(
          '/usr/bin/sandbox-exec',
          ['-p', commandProfile(toolbox.root, { pty: true }), '/bin/zsh', '-f'],
          {
            name: 'xterm-256color',
            cols: info.cols,
            rows: info.rows,
            cwd: toolbox.root,
            env: {
              PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
              TERM: 'xterm-256color',
              LANG: 'en_US.UTF-8',
              LC_ALL: 'en_US.UTF-8',
              HOME: toolbox.root,
              ZDOTDIR: toolbox.root,
              PS1: 'Devly %1~ %# ',
              HISTFILE: '/dev/null',
            },
          },
        )
      } catch (error) {
        if (error instanceof ContractError) throw error
        throw new ContractError({
          ...failure('INTERNAL_ERROR'),
          message: '终端原生依赖不可用，请重新安装对应架构的完整应用后重启；已有本地数据保留。',
        })
      }
      const session: Session = { info, owner, process: child, text: '', start: 0, end: 0 }
      this.sessions.set(info.id, session)
      child.onData((text) => {
        session.text += text
        session.end += text.length
        if (session.text.length > 262144) {
          const trim = session.text.length - 262144
          session.text = session.text.slice(trim)
          session.start += trim
        }
      })
      child.onExit((event) => {
        session.info.exitCode = event.exitCode
        if (!session.cleanup) session.info.state = 'exited'
      })
      return { ...info }
    }
    const session = this.sessions.get(String(args.terminalId))
    if (!session || session.owner !== owner || session.info.projectId !== projectId)
      throw new ContractError(failure('NOT_FOUND'))
    if (operation === 'terminal.close') return this.stop(session)
    if (operation === 'terminal.read') {
      const after = Number(args.after),
        start = Math.max(after, session.start)
      if (after > session.end) throw new ContractError(failure('INVALID_REQUEST'))
      return {
        info: { ...session.info },
        text: session.text.slice(start - session.start),
        cursor: session.end,
        truncated: after < session.start,
      }
    }
    if (session.info.state !== 'running') throw new ContractError(failure('FORBIDDEN'))
    if (operation === 'terminal.write') {
      session.process.write(String(args.text))
      return { accepted: true }
    }
    if (operation === 'terminal.resize') {
      session.process.resize(Number(args.cols), Number(args.rows))
      session.info.cols = Number(args.cols)
      session.info.rows = Number(args.rows)
      return { ...session.info }
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
}
