import { spawn } from 'node:child_process'
import { lstat, realpath, stat } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { z } from 'zod'
import { redactToolText, ToolFailure } from './tools'
import { StringDecoder } from 'node:string_decoder'
import { SecretRedactor } from '../chat/redactor'

export const commandRequest = z
  .object({
    command: z
      .string()
      .min(1)
      .max(8192)
      .refine((text) => !text.includes('\0')),
    cwd: z.string().max(1000).default('.'),
    timeoutMs: z.number().int().min(100).max(120000).default(30000),
    maxOutputBytes: z.number().int().min(256).max(262144).default(65536),
  })
  .strict()
export type CommandRequest = z.input<typeof commandRequest>

/** A defense-in-depth macOS profile; there is deliberately no unsandboxed fallback. */
export function commandProfile(
  root: string,
  options: { readOnly?: boolean; gitMetadata?: boolean } = {},
) {
  const quote = JSON.stringify
  const insensitive = (pattern: string) =>
    pattern.replace(/[a-z]/g, (character) => `[${character}${character.toUpperCase()}]`)
  const secretPaths = insensitive(
    '/(\\.env([^/]*)?|\\.ssh|\\.aws|\\.codex|\\.agents|credentials|auth\\.json|\\.npmrc|\\.netrc|id_rsa|id_ed25519)(/|$)',
  )
  const secretExtensions = insensitive('\\.(pem|key|p12|pfx|sqlite|db)$')
  return `(version 1)
(deny default)
(allow process-exec process-fork)
(allow process-info* (target same-sandbox))
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow file-read-metadata)
(allow file-read* (literal "/") (subpath ${quote(root)}) (subpath "/System") (subpath "/Library/Developer") (subpath "/Library/Apple") (subpath "/private/etc") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/private/var/db/dyld") (subpath "/dev"))
(allow file-write* ${options.readOnly ? '' : `(subpath ${quote(root)})`} (literal "/dev/null"))
(deny ${options.gitMetadata ? 'file-write*' : 'file-read* file-write*'} (subpath ${quote(resolve(root, '.git'))}))
(deny file-read* file-write* (regex #"${secretPaths}") (regex #"${secretExtensions}"))`
}

/** Main-only executor. The coordinator requires a fresh scoped approval before every invocation. */
export async function executeProjectCommand(
  root: string,
  raw: CommandRequest,
  signal: AbortSignal,
  onChunk: (stream: 'stdout' | 'stderr', text: string) => void = () => {},
  secret = '',
) {
  const args = commandRequest.parse(raw)
  if (process.platform !== 'darwin') throw new Error('UNSUPPORTED_PLATFORM')
  signal.throwIfAborted()
  const canonical = await realpath(root)
  if ((await lstat(root)).isSymbolicLink()) throw new Error('PROJECT_CHANGED')
  const cwd = await realpath(resolve(canonical, args.cwd))
  const rel = relative(canonical, cwd)
  if (rel === '..' || rel.startsWith('..' + sep) || !(await stat(cwd)).isDirectory())
    throw new Error('PATH_DENIED')
  return new Promise<{
    exitCode: number | null
    signal: string | null
    stdout: string
    stderr: string
    state: 'completed' | 'failed' | 'cancelled' | 'timeout' | 'output_limit' | 'unknown'
  }>((done, reject) => {
    let state: 'running' | 'cancelled' | 'timeout' | 'output_limit' = 'running'
    let stdout = '',
      stderr = '',
      bytes = 0
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') }
    const redactors = { stdout: new SecretRedactor(secret), stderr: new SecretRedactor(secret) }
    const pending = { stdout: '', stderr: '' }
    let storageFailed = false
    let settled = false,
      cleanupFailed = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let escalation: ReturnType<typeof setTimeout> | undefined
    const child = spawn(
      '/usr/bin/sandbox-exec',
      ['-p', commandProfile(canonical), '/bin/sh', '-c', args.command],
      {
        cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LC_ALL: 'C', LANG: 'en_US.UTF-8' },
      },
    )
    const kill = (kind: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        process.kill(-child.pid, kind)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          cleanupFailed = true
          child.kill(kind)
        }
      }
    }
    const stop = (reason: typeof state) => {
      if (state !== 'running') return
      state = reason
      kill('SIGTERM')
      escalation = setTimeout(() => kill('SIGKILL'), 300)
      watchdog = setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        child.stdout.destroy()
        child.stderr.destroy()
        reject(new ToolFailure('EXECUTION_STATE_UNKNOWN'))
      }, 2000)
    }
    const abort = () => stop('cancelled')
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const timeout = setTimeout(() => stop('timeout'), args.timeoutMs)
    const emit = (kind: 'stdout' | 'stderr', text: string) => {
      const safe = redactToolText(text, secret)
      if (kind === 'stdout') stdout += safe
      else stderr += safe
      try {
        if (safe) onChunk(kind, safe)
      } catch {
        storageFailed = true
        if (!settled) stop('output_limit')
      }
    }
    // Exact credentials are withheld across chunks; generic credentials are redacted per bounded line.
    const consume = (kind: 'stdout' | 'stderr', text: string, final = false) => {
      pending[kind] += redactors[kind].push(text)
      if (final) pending[kind] += redactors[kind].finish()
      const end = final ? pending[kind].length : pending[kind].lastIndexOf('\n') + 1
      if (end > 0) {
        emit(kind, pending[kind].slice(0, end))
        pending[kind] = pending[kind].slice(end)
      }
    }
    const chunk = (kind: 'stdout' | 'stderr', buffer: Buffer) => {
      if (settled) return
      const allowed = Math.max(0, args.maxOutputBytes - bytes)
      const text = decoders[kind].write(buffer.subarray(0, allowed))
      consume(kind, text)
      bytes += buffer.length
      if (bytes > args.maxOutputBytes) stop('output_limit')
    }
    child.stdout.on('data', (buffer: Buffer) => chunk('stdout', buffer))
    child.stderr.on('data', (buffer: Buffer) => chunk('stderr', buffer))
    const cleanup = () => {
      clearTimeout(timeout)
      clearTimeout(escalation)
      clearTimeout(watchdog)
      signal.removeEventListener('abort', abort)
    }
    child.on('error', () => {
      settled = true
      cleanup()
      reject(new Error('COMMAND_UNAVAILABLE'))
    })
    child.on('close', (exitCode, terminationSignal) => {
      if (settled) return
      settled = true
      // Reap remaining ordinary descendants even if the shell returned first.
      kill('SIGKILL')
      cleanup()
      consume('stdout', decoders.stdout.end(), true)
      consume('stderr', decoders.stderr.end(), true)
      if (storageFailed) {
        reject(new Error('OUTPUT_STORAGE_FAILED'))
        return
      }
      done({
        exitCode,
        signal: terminationSignal,
        stdout,
        stderr,
        state: cleanupFailed
          ? 'unknown'
          : state === 'running'
            ? exitCode === 0
              ? 'completed'
              : 'failed'
            : state,
      })
    })
  })
}
