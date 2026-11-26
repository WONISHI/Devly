import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, rename, unlink, link } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

import type { PatchRequest } from './patch-executor'

export const contentHash = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex')
export type PatchResult = {
  path: string
  state: 'applied' | 'conflict' | 'failed' | 'cancelled'
  hash: string | null
  error: string | null
  recoveryPath?: string
  written?: boolean
}
const locks = new Map<string, Promise<unknown>>()

/** Serializes writes by canonical project root, including calls from different sessions. */
export async function applyProjectPatch(
  root: string,
  input: PatchRequest,
  signal: AbortSignal,
): Promise<PatchResult[]> {
  const request = input
  const canonical = await realpath(root)
  if ((await lstat(root)).isSymbolicLink()) throw new Error('PROJECT_CHANGED')
  const previous = locks.get(canonical) ?? Promise.resolve()
  const task = previous
    .catch(() => {})
    .then(async () => {
      const results: PatchResult[] = []
      for (const item of request.changes) {
        let temporary: string | undefined
        let recovery: string | undefined
        let published = false
        try {
          signal.throwIfAborted()
          if (
            !item.path ||
            item.path.includes('\\') ||
            item.path.includes('\0') ||
            item.path.startsWith('/') ||
            /^[a-z]:/i.test(item.path) ||
            item.path
              .split('/')
              .some(
                (part) =>
                  ['..', '.git', '.ssh', '.aws', '.codex', '.agents'].includes(
                    part.toLowerCase(),
                  ) ||
                  /^(\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?|auth\.json|\.npmrc|\.netrc|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx|sqlite|db)$/i.test(
                    part,
                  ),
              )
          )
            throw new Error('PATH_DENIED')
          const destination = resolve(canonical, item.path)
          const inside = relative(canonical, destination)
          if (!inside || inside.startsWith('..' + sep) || inside === '..')
            throw new Error('PATH_DENIED')
          let cursor = canonical
          for (const part of inside.split(sep).slice(0, -1)) {
            cursor = join(cursor, part)
            const info = await lstat(cursor)
            if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('PATH_DENIED')
          }
          const parent = await realpath(dirname(destination))
          if (parent !== dirname(destination) || (await realpath(canonical)) !== canonical)
            throw new Error('PATH_DENIED')
          const readVersion = async (expectedLinks = 1) => {
            const info = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') return null
              throw error
            })
            if (!info) return { hash: null, mode: 0o600, ino: 0, dev: 0 }
            if (
              !info.isFile() ||
              info.isSymbolicLink() ||
              info.nlink !== expectedLinks ||
              info.size > 262144
            )
              throw new Error('FILE_DENIED')
            const handle = await open(
              destination,
              constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
            )
            try {
              const stat = await handle.stat()
              if (stat.ino !== info.ino || stat.dev !== info.dev || stat.size > 262144)
                throw new Error('FILE_CHANGED')
              const buffer = Buffer.alloc(262145)
              let length = 0
              while (length < buffer.length) {
                const chunk = await handle.read(buffer, length, buffer.length - length, length)
                if (!chunk.bytesRead) break
                length += chunk.bytesRead
              }
              if (length > 262144) throw new Error('FILE_CHANGED')
              const bytes = buffer.subarray(0, length)
              if (bytes.includes(0)) throw new Error('FILE_DENIED')
              const text = new TextDecoder('utf8', { fatal: true }).decode(bytes)
              if (
                /(?:-----BEGIN [^-]*PRIVATE KEY|\bsk-[\w-]{12,}\b|(?:api[_-]?key|access[_-]?token|password)["']?\s*[=:]\s*["']?[^\s"',;]{8,})/i.test(
                  text,
                )
              )
                throw new Error('FILE_DENIED')
              return {
                hash: contentHash(bytes),
                mode: info.mode & 0o777,
                ino: info.ino,
                dev: info.dev,
              }
            } finally {
              await handle.close()
            }
          }
          const version = await readVersion()
          if (version.hash !== item.expectedHash) {
            results.push({
              path: item.path,
              state: 'conflict',
              hash: version.hash,
              error: 'VERSION_CONFLICT',
            })
            continue
          }
          temporary = join(parent, `.devly-patch-${randomUUID()}.tmp`)
          const handle = await open(temporary, 'wx', version.mode)
          try {
            await handle.writeFile(item.content, 'utf8')
            await handle.sync()
          } finally {
            await handle.close()
          }
          signal.throwIfAborted()
          if (
            (await readVersion()).hash !== item.expectedHash ||
            (await realpath(parent)) !== parent
          )
            throw new Error('VERSION_CONFLICT')
          if (item.expectedHash === null) {
            // Linking is an atomic no-replace publication for new files.
            await link(temporary, destination)
            await unlink(temporary)
          } else {
            // Keep the original inode reachable: an uncooperative writer racing rename must not lose its bytes.
            recovery = join(parent, `.devly-before-${randomUUID()}`)
            await link(destination, recovery)
            const saved = await lstat(recovery)
            if (
              saved.ino !== version.ino ||
              saved.dev !== version.dev ||
              (await readVersion(2)).hash !== item.expectedHash
            )
              throw new Error('VERSION_CONFLICT')
            signal.throwIfAborted()
            await rename(temporary, destination)
            published = true
          }
          temporary = undefined
          results.push({
            path: item.path,
            state: 'applied',
            hash: contentHash(item.content),
            error: null,
            ...(recovery ? { recoveryPath: relative(canonical, recovery), written: true } : {}),
          })
        } catch (error) {
          const code = error instanceof Error ? error.message : 'WRITE_FAILED'
          results.push({
            path: item.path,
            state: signal.aborted
              ? 'cancelled'
              : code === 'VERSION_CONFLICT' || (error as NodeJS.ErrnoException).code === 'EEXIST'
                ? 'conflict'
                : 'failed',
            hash: null,
            error: signal.aborted
              ? 'CANCELLED'
              : ['PATH_DENIED', 'FILE_DENIED', 'FILE_CHANGED', 'VERSION_CONFLICT'].includes(code)
                ? code
                : 'WRITE_FAILED',
          })
        } finally {
          if (temporary) await unlink(temporary).catch(() => {})
          if (recovery && !published) await unlink(recovery).catch(() => {})
        }
      }
      return results
    })
  locks.set(canonical, task)
  try {
    return await task
  } finally {
    if (locks.get(canonical) === task) locks.delete(canonical)
  }
}
