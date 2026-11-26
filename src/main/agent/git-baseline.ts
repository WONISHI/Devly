import { commandProfile } from './command-executor'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpath, lstat } from 'node:fs/promises'
import { relative, sep, dirname, join } from 'node:path'

export type GitBaseline = {
  root: string | null
  head: string | null
  entries: string[]
  fingerprint: string
  available: boolean
}
export async function captureGitBaseline(
  project: string,
  signal?: AbortSignal,
): Promise<GitBaseline> {
  const cwd = await realpath(project)
  const unavailable: GitBaseline = {
    root: null,
    head: null,
    entries: [],
    fingerprint: '',
    available: false,
  }
  if (process.platform !== 'darwin') return unavailable
  let repository = cwd
  while (!(await lstat(join(repository, '.git')).catch(() => null))) {
    const parent = dirname(repository)
    if (parent === repository) return unavailable
    repository = parent
  }
  const profile = commandProfile(repository, { readOnly: true, gitMetadata: true })
  const run = (args: string[]) =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      const child = spawn(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          profile,
          '/usr/bin/git',
          '--no-optional-locks',
          '-c',
          'core.fsmonitor=false',
          ...args,
        ],
        {
          cwd,
          timeout: 5000,
          signal,
          detached: true,
          env: {
            PATH: '/usr/bin:/bin',
            LC_ALL: 'C',
            GIT_TERMINAL_PROMPT: '0',
            GIT_CONFIG_GLOBAL: '/dev/null',
            GIT_CONFIG_SYSTEM: '/dev/null',
          },
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
      const chunks: Buffer[] = []
      let bytes = 0
      const kill = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            child.kill('SIGKILL')
          }
        }
      }
      const timer = setTimeout(kill, 5000)
      let overflow = false
      child.stdout.on('data', (chunk: Buffer) => {
        if (bytes + chunk.length > 1_048_576) {
          overflow = true
          kill()
          return
        }
        bytes += chunk.length
        chunks.push(chunk)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        kill()
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        kill()
        if (overflow) reject(new Error('BASELINE_LIMIT'))
        else resolve({ code: code ?? 1, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
  const top = await run(['rev-parse', '--show-toplevel'])
  if (top.code !== 0)
    return { root: null, head: null, entries: [], fingerprint: '', available: false }
  const root = await realpath(top.text.trim())
  const scope = relative(root, cwd)
  if (scope === '..' || scope.startsWith('..' + sep)) throw new Error('INVALID_GIT_ROOT')
  const head = await run(['rev-parse', '--verify', 'HEAD'])
  const status = await run(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
  if (status.code !== 0) throw new Error('BASELINE_UNAVAILABLE')
  const entries = status.text.split('\0').filter(Boolean)
  return {
    root,
    head: head.code === 0 ? head.text.trim() : null,
    entries,
    available: true,
    fingerprint: createHash('sha256')
      .update(head.text)
      .update('\0')
      .update(status.text)
      .digest('hex'),
  }
}

/** Differences are observations, not attribution: users and external processes can edit concurrently. */
export function compareGitBaselines(before: GitBaseline, after: GitBaseline) {
  const old = new Set(before.entries),
    current = new Set(after.entries)
  return {
    comparable: before.available && after.available && before.root === after.root,
    headChanged: before.head !== after.head,
    before: before.entries,
    addedOrChanged: after.entries.filter((entry) => !old.has(entry)),
    disappearedOrChanged: before.entries.filter((entry) => !current.has(entry)),
    attribution: 'observed-only' as const,
  }
}
