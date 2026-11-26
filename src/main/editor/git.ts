import { spawn } from 'node:child_process'
import { realpath, lstat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { commandProfile } from '../agent/command-executor'
import { ReadOnlyToolbox, redactToolText } from '../agent/tools'
import type { FileChange, ProjectDiff, ProjectDocument } from '../../shared/editor-contracts'

export async function gitRoot(project: string): Promise<string | null> {
  let cursor = await realpath(project)
  while (!(await lstat(join(cursor, '.git')).catch(() => null))) {
    const parent = dirname(cursor)
    if (parent === cursor) return null
    cursor = parent
  }
  return cursor
}
export function readGit(
  root: string,
  cwd: string,
  args: string[],
  maxBytes = 1_048_576,
): Promise<{ code: number; bytes: Buffer }> {
  if (process.platform !== 'darwin') return Promise.reject(new Error('UNSUPPORTED_PLATFORM'))
  return new Promise((done, reject) => {
    const child = spawn(
      '/usr/bin/sandbox-exec',
      [
        '-p',
        commandProfile(root, { readOnly: true, gitMetadata: true }),
        '/usr/bin/git',
        '--no-pager',
        '--literal-pathspecs',
        '--no-optional-locks',
        '-c',
        'core.fsmonitor=false',
        ...args,
      ],
      {
        cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: {
          PATH: '/usr/bin:/bin',
          LC_ALL: 'C',
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      },
    )
    let length = 0,
      exceeded = false
    const chunks: Buffer[] = []
    const kill = () => {
      if (child.pid)
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
    }
    const timer = setTimeout(kill, 5000)
    child.stdout.on('data', (chunk: Buffer) => {
      length += chunk.length
      if (length > maxBytes) {
        exceeded = true
        kill()
      } else chunks.push(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      kill()
      reject(new Error('GIT_UNAVAILABLE'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      kill()
      if (exceeded) reject(new Error('FILE_TOO_LARGE'))
      else done({ code: code ?? 1, bytes: Buffer.concat(chunks) })
    })
  })
}
export function parseStatus(bytes: Buffer): FileChange[] {
  const entries = bytes.toString('utf8').split('\0'),
    changes: FileChange[] = []
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (!entry) continue
    const status = entry.slice(0, 2),
      path = entry.slice(3)
    const renamed = /[RC]/.test(status)
    const oldPath = renamed ? (entries[++index] ?? null) : null
    const kind: FileChange['kind'] =
      status.includes('U') || ['AA', 'DD'].includes(status)
        ? 'unmerged'
        : renamed
          ? 'renamed'
          : status === '??' || status.includes('A')
            ? 'added'
            : status.includes('D')
              ? 'deleted'
              : status.includes('M')
                ? 'modified'
                : 'other'
    changes.push({ path, oldPath, status, kind })
  }
  return changes
}
function within(project: string, repo: string, path: string | null) {
  if (!path) return null
  const rel = relative(project, resolve(repo, path))
  return !rel || rel === '..' || rel.startsWith('..' + sep) || rel.length > 1000
    ? null
    : rel.split(sep).join('/')
}
export async function projectChanges(toolbox: ReadOnlyToolbox) {
  const root = await gitRoot(toolbox.root)
  if (!root) return { available: false, changes: [], truncated: false, reason: 'non_git' as const }
  try {
    const result = await readGit(root, toolbox.root, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--',
      '.',
    ])
    if (result.code !== 0) throw new Error('GIT_UNAVAILABLE')
    const raw = parseStatus(result.bytes),
      changes: FileChange[] = []
    for (const change of raw.slice(0, 1000)) {
      const path = within(toolbox.root, root, change.path),
        oldPath = within(toolbox.root, root, change.oldPath)
      if (!path && oldPath && (await toolbox.pathAllowed(oldPath)))
        changes.push({ ...change, path: oldPath, oldPath: null, kind: 'deleted' })
      else if (path && (await toolbox.pathAllowed(path)))
        changes.push({
          ...change,
          path,
          oldPath: oldPath && (await toolbox.pathAllowed(oldPath)) ? oldPath : null,
        })
    }
    return { available: true, changes, truncated: raw.length > 1000, reason: 'ready' as const }
  } catch {
    return { available: false, changes: [], truncated: false, reason: 'unavailable' as const }
  }
}
export const unavailableDocument = (
  path: string,
  status: ProjectDocument['status'],
): ProjectDocument => ({ path, status, text: null, version: null, bytes: null })
export function blobDocument(path: string, bytes: Buffer): ProjectDocument {
  if (bytes.length > 262144) return unavailableDocument(path, 'too_large')
  if (bytes.includes(0)) return unavailableDocument(path, 'binary')
  try {
    const text = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(bytes)
    if (redactToolText(text) !== text) return unavailableDocument(path, 'denied')
    return { path, status: 'text', text, version: null, bytes: bytes.length }
  } catch {
    return unavailableDocument(path, 'encoding')
  }
}
export async function projectDiff(
  toolbox: ReadOnlyToolbox,
  path: string,
  modified: ProjectDocument,
): Promise<ProjectDiff> {
  const denied = () => ({
    path,
    oldPath: null,
    original: unavailableDocument(path, 'denied'),
    modified: unavailableDocument(path, 'denied'),
    baseline: 'HEAD' as const,
    available: false,
  })
  if (!(await toolbox.pathAllowed(path))) return denied()
  const root = await gitRoot(toolbox.root),
    snapshot = await projectChanges(toolbox)
  if (!root || !snapshot.available)
    return {
      path,
      oldPath: null,
      original: unavailableDocument(path, 'unavailable'),
      modified,
      baseline: 'HEAD',
      available: false,
    }
  const change = snapshot.changes.find((change) => change.path === path)
  const oldPath = change?.oldPath ?? path
  if (!(await toolbox.pathAllowed(oldPath))) return denied()
  const gitPath = relative(root, resolve(toolbox.root, oldPath)).split(sep).join('/')
  let original: ProjectDocument
  try {
    const result = await readGit(root, toolbox.root, ['show', `HEAD:${gitPath}`], 262144)
    original =
      result.code === 0
        ? blobDocument(oldPath, result.bytes)
        : unavailableDocument(oldPath, 'missing')
  } catch (error) {
    original = unavailableDocument(
      oldPath,
      error instanceof Error && error.message === 'FILE_TOO_LARGE' ? 'too_large' : 'unavailable',
    )
  }
  return {
    path,
    oldPath: change?.oldPath ?? null,
    original,
    modified,
    baseline: 'HEAD',
    available: true,
  }
}
