import { supportsHostExecution } from '../../shared/host-support'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpath } from 'node:fs/promises'
import { commandProfile } from './command-executor'
import { patchRequest, type PatchRequest } from './patch-executor'
import type { PatchResult } from './patch-core'

export async function applyIsolatedPatch(
  root: string,
  input: PatchRequest,
  signal: AbortSignal,
): Promise<PatchResult[]> {
  if (!supportsHostExecution(process.platform)) throw new Error('UNSUPPORTED_PLATFORM')
  const patch = patchRequest.parse(input)
  const canonical = await realpath(root)
  const executable = await realpath(process.execPath)
  const worker = fileURLToPath(new URL('./patch-worker.js', import.meta.url))
  const codeRoot = dirname(worker)
  const runtimeRoot = resolve(dirname(executable), '..')
  signal.throwIfAborted()
  return new Promise((done, reject) => {
    // Only the fixed filesystem helper receives these read paths, never a model shell command.
    const profile =
      commandProfile(canonical) +
      `\n(allow file-read* (subpath ${JSON.stringify(codeRoot)}) (subpath ${JSON.stringify(runtimeRoot)}))`
    const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, executable, worker], {
      cwd: canonical,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '1', LC_ALL: 'C' },
    })
    let output = '',
      failed = false
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          child.kill('SIGKILL')
        }
      }
    }
    const abort = () => kill()
    const timeout = setTimeout(() => {
      failed = true
      kill()
    }, 15000)
    const cleanup = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (text: string) => {
      output += text
      if (output.length > 100000) {
        failed = true
        kill()
      }
    })
    child.stderr.resume()
    child.stdin.on('error', () => {
      failed = true
    })
    child.on('error', () => {
      cleanup()
      reject(new Error('ISOLATION_UNAVAILABLE'))
    })
    child.on('close', (code) => {
      cleanup()
      if (signal.aborted) {
        reject(new Error('CANCELLED'))
        return
      }
      if (failed || code !== 0) {
        reject(new Error('PATCH_STATE_UNCONFIRMED'))
        return
      }
      try {
        done(JSON.parse(output) as PatchResult[])
      } catch {
        reject(new Error('PATCH_STATE_UNCONFIRMED'))
      }
    })
    child.stdin.end(JSON.stringify({ root: canonical, patch }))
  })
}
