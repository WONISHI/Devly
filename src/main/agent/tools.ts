import { z } from 'zod'
import { createHash } from 'node:crypto'
import ignore from 'ignore'
import { constants } from 'node:fs'
import { lstat, open, realpath, readdir, stat } from 'node:fs/promises'
import { resolve, relative, sep, posix } from 'node:path'
import type { Tool } from '../../shared/provider-contracts'

export class ToolFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
const pathArg = z.string().min(1).max(1000).default('.')
const schemas = {
  list_files: z
    .object({
      path: pathArg,
      offset: z.number().int().min(0).max(10000).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    })
    .strict(),
  read_file: z
    .object({
      path: pathArg,
      startLine: z.number().int().min(1).max(100000).default(1),
      limit: z.number().int().min(1).max(300).default(150),
    })
    .strict(),
  search_text: z
    .object({
      query: z.string().min(1).max(200),
      path: pathArg,
      offset: z.number().int().min(0).max(1000).default(0),
      limit: z.number().int().min(1).max(100).default(40),
    })
    .strict(),
} as const
type ToolName = keyof typeof schemas
const descriptions = {
  list_files:
    'List one directory in the selected project. Results are paginated; ignored, secret and symlink paths are excluded. No writes.',
  read_file:
    'Read UTF-8 project text by line, at most 256 KiB per file. Includes line numbers and truncation metadata. No writes.',
  search_text:
    'Find a literal, case-sensitive string in allowed UTF-8 project files. Respects .gitignore; no regex, commands or external paths.',
}
export const readOnlyTools: Tool[] = Object.entries(schemas).map(([name, schema]) => ({
  name,
  description: descriptions[name as ToolName],
  parameters: z.toJSONSchema(schema) as Record<string, unknown>,
}))
const ignoredNames = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.pnpm-store',
  '.cache',
  'dist',
  'build',
  'out',
  'release',
  'coverage',
  '.next',
  '.ssh',
  '.aws',
  '.codex',
  '.agents',
  '.venv',
  'vendor',
])
const secretName =
  /^(?:\.env(?:\..*)?|credentials(?:\..*)?|secrets?(?:\..*)?|auth\.json|\.npmrc|\.netrc|id_rsa|id_ed25519)$|\.(?:pem|key|p12|pfx|sqlite|db)$/i
const containsSecret =
  /(?:-----BEGIN [^-]*(?:PRIVATE KEY)|\b(?:sk-[\w-]{12,}|AKIA[A-Z0-9]{16})\b|(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[=:]\s*["']?[^\s"',;]{8,})/i
export function redactToolText(value: string, secret = ''): string {
  if (
    secret &&
    value
      .replace(/\\u([\da-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .includes(secret)
  )
    value = value.split(secret).join('[REDACTED]')
  if (
    secret &&
    value
      .replace(/\\u([\da-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .includes(secret)
  )
    return '[REDACTED encoded credential]'
  if (secret) value = value.split(JSON.stringify(secret).slice(1, -1)).join('[REDACTED]')
  let text = secret ? value.split(secret).join('[REDACTED]') : value
  text = text.replace(
    /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  )
  return text
    .replace(/\b(?:sk-[\w-]{12,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(
      /((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[=:]\s*)(["']?)[^\s"',;]{8,}\2/gi,
      '$1$2[REDACTED]$2',
    )
}
// A distinct registry, with no shell, write, network or arbitrary import entry point.
export class ReadOnlyToolbox {
  private constructor(
    readonly root: string,
    private signal: AbortSignal,
    private secret: string,
  ) {}
  static async create(root: string, signal: AbortSignal, secret = '') {
    const canonical = await realpath(root)
    if (!(await stat(canonical)).isDirectory()) throw new ToolFailure('PROJECT_UNAVAILABLE')
    return new ReadOnlyToolbox(canonical, signal, secret)
  }
  check() {
    if (this.signal.aborted) throw new ToolFailure('CANCELLED')
  }
  private normalize(path: string): string {
    if (
      path.includes('\\') ||
      path.includes('\0') ||
      path.startsWith('/') ||
      /^[a-z]:/i.test(path) ||
      path.split('/').includes('..')
    )
      throw new ToolFailure('PATH_DENIED')
    const normalized = posix.normalize(path).replace(/^\.\//, '')
    if (normalized.split('/').length > 16) throw new ToolFailure('PATH_DEPTH_LIMIT')
    if (
      normalized
        .split('/')
        .some(
          (p) =>
            p.toLowerCase().startsWith('.devly-before-') ||
            p.toLowerCase().startsWith('.devly-patch-') ||
            ignoredNames.has(p.toLowerCase()) ||
            secretName.test(p),
        )
    )
      throw new ToolFailure('PATH_DENIED')
    return normalized
  }
  private async checked(path: string) {
    this.check()
    const rel = this.normalize(path)
    let current = this.root
    for (const part of rel === '.' ? [] : rel.split('/')) {
      current = resolve(current, part)
      if ((await lstat(current)).isSymbolicLink()) throw new ToolFailure('SYMLINK_DENIED')
    }
    const canonical = await realpath(current),
      inside = relative(this.root, canonical)
    if (
      inside === '..' ||
      inside.startsWith('..' + sep) ||
      resolve(this.root, inside) !== canonical
    )
      throw new ToolFailure('PATH_DENIED')
    // A project root replaced by a symlink is not followed after initialization.
    if ((await realpath(this.root)) !== this.root || (await lstat(this.root)).isSymbolicLink())
      throw new ToolFailure('PATH_DENIED')
    return { rel, path: canonical }
  }
  private async raw(path: string): Promise<string> {
    const file = await this.checked(path)
    const before = await lstat(file.path)
    if (!before.isFile()) throw new ToolFailure('NOT_TEXT_FILE')
    if (before.size > 262144) throw new ToolFailure('FILE_TOO_LARGE')
    const handle = await open(
      file.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const info = await handle.stat()
      if (
        !info.isFile() ||
        info.dev !== before.dev ||
        info.ino !== before.ino ||
        info.size > 262144
      )
        throw new ToolFailure('FILE_CHANGED')
      const buffer = Buffer.alloc(Math.min(info.size + 1, 262145))
      let bytesRead = 0
      while (bytesRead < buffer.length) {
        this.check()
        const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
        if (!chunk.bytesRead) break
        bytesRead += chunk.bytesRead
      }
      if (bytesRead > 262144) throw new ToolFailure('FILE_TOO_LARGE')
      const after = await this.checked(path),
        current = await lstat(after.path)
      if (
        current.dev !== info.dev ||
        current.ino !== info.ino ||
        current.size !== info.size ||
        current.mtimeMs !== info.mtimeMs
      )
        throw new ToolFailure('FILE_CHANGED')
      this.check()
      const bytes = buffer.subarray(0, bytesRead)
      if (bytes.includes(0)) throw new ToolFailure('BINARY_FILE')
      try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      } catch {
        throw new ToolFailure('INVALID_UTF8')
      }
    } finally {
      await handle.close()
    }
  }
  private async allowed(path: string, directory = false): Promise<boolean> {
    let rel: string
    try {
      rel = this.normalize(path)
    } catch {
      return false
    }
    const parts = rel === '.' ? [] : rel.split('/')
    for (let depth = 0; depth < parts.length; depth++) {
      const parent = parts.slice(0, depth).join('/'),
        rulePath = parent ? parent + '/.gitignore' : '.gitignore'
      let rules = ''
      try {
        rules = await this.raw(rulePath)
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          // Unreadable ignore rules fail closed, except an absent file.
          throw new ToolFailure('IGNORE_RULES_UNAVAILABLE')
        }
      }
      const candidate = parts.slice(depth).join('/') + (directory ? '/' : '')
      if (rules && ignore().add(rules).ignores(candidate)) return false
    }
    return true
  }
  async pathAllowed(path: string) {
    return this.allowed(path)
  }
  async directoryPath(path: string) {
    const entry = await this.checked(path)
    if (!(await stat(entry.path)).isDirectory() || !(await this.allowed(path, true)))
      throw new ToolFailure('PATH_DENIED')
    return entry.path
  }
  async document(path: string) {
    if (!(await this.allowed(path))) throw new ToolFailure('IGNORED_PATH')
    const text = await this.raw(path)
    if ((this.secret && redactToolText(text, this.secret) !== text) || containsSecret.test(text))
      throw new ToolFailure('SENSITIVE_CONTENT')
    return {
      path,
      text,
      version: createHash('sha256').update(text).digest('hex'),
      bytes: Buffer.byteLength(text),
    }
  }
  async read(path: string, startLine = 1, limit = 150) {
    if (!(await this.allowed(path))) throw new ToolFailure('IGNORED_PATH')
    const raw = await this.raw(path)
    if ((this.secret && redactToolText(raw, this.secret) !== raw) || containsSecret.test(raw))
      throw new ToolFailure('SENSITIVE_CONTENT')
    const lines = raw.split(/\r\n|\n|\r/),
      selected = lines.slice(startLine - 1, startLine - 1 + limit)
    let text = selected.map((line, index) => `${startLine + index}: ${line}`).join('\n')
    const charTruncated = text.length > 12000
    text = text.slice(0, 12000)
    return {
      path,
      contentHash: createHash('sha256').update(raw).digest('hex'),
      startLine,
      endLine: Math.min(lines.length, startLine - 1 + selected.length),
      totalLines: lines.length,
      text,
      truncated: charTruncated || startLine - 1 + selected.length < lines.length,
      nextLine: charTruncated
        ? null
        : startLine - 1 + selected.length < lines.length
          ? startLine + selected.length
          : null,
    }
  }
  async scopedGuidance(path: string) {
    const parts = this.normalize(path).split('/').slice(0, -1)
    const sources: { path: string; text: string; truncated: boolean }[] = []
    let chars = 0
    for (let depth = 1; depth <= parts.length; depth++) {
      const guide = parts.slice(0, depth).join('/') + '/AGENTS.md'
      try {
        const file = await this.read(guide, 1, 150)
        if (chars + file.text.length > 16000) {
          sources.push({
            path: guide,
            text: '[Scoped guidance exceeds bounded tool output; read explicitly if needed]',
            truncated: true,
          })
          break
        }
        chars += file.text.length
        sources.push({ path: guide, text: file.text, truncated: file.truncated })
      } catch (error) {
        if (this.signal.aborted) throw error
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
        if (
          error instanceof ToolFailure &&
          ['IGNORED_PATH', 'SENSITIVE_CONTENT'].includes(error.code)
        )
          continue
        throw error
      }
    }
    return sources
  }
  private async entries(path: string) {
    const dir = await this.checked(path)
    if (!(await stat(dir.path)).isDirectory() || !(await this.allowed(path, true)))
      throw new ToolFailure('PATH_DENIED')
    const list = [] as { path: string; type: 'directory' | 'file' }[]
    const iterator = await readdir(dir.path, { withFileTypes: true })
    if (iterator.length > 10000) throw new ToolFailure('DIRECTORY_LIMIT')
    for (const entry of iterator) {
      this.check()
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) continue
      const rel = posix.join(dir.rel, entry.name)
      if (await this.allowed(rel, entry.isDirectory()))
        list.push({
          path: rel,
          type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
        })
    }
    return list.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  }
  async execute(name: string, argumentsText: string): Promise<Record<string, unknown>> {
    if (!Object.hasOwn(schemas, name)) throw new ToolFailure('UNKNOWN_TOOL')
    let input: unknown
    try {
      input = JSON.parse(argumentsText)
    } catch {
      throw new ToolFailure('INVALID_JSON')
    }
    const parsed = schemas[name as ToolName].safeParse(input)
    if (!parsed.success) throw new ToolFailure('INVALID_ARGUMENTS')
    const args = parsed.data
    if (name === 'read_file') {
      const value = schemas.read_file.parse(args)
      return this.read(value.path, value.startLine, value.limit)
    }
    if (name === 'list_files') {
      const value = schemas.list_files.parse(args),
        all = await this.entries(value.path)
      return {
        entries: all.slice(value.offset, value.offset + value.limit),
        nextOffset: value.offset + value.limit < all.length ? value.offset + value.limit : null,
        truncated: value.offset + value.limit < all.length,
      }
    }
    const value = schemas.search_text.parse(args),
      queue = [value.path]
    const matches: { path: string; line: number; text: string }[] = []
    let visited = 0,
      scanned = 0,
      skipped = 0,
      exhausted = false
    while (queue.length && matches.length <= value.offset + value.limit) {
      this.check()
      const dir = queue.shift()!
      for (const entry of await this.entries(dir)) {
        if (++visited > 2000) {
          exhausted = true
          break
        }
        if (entry.type === 'directory') {
          if (entry.path.split('/').length < 16) queue.push(entry.path)
          else exhausted = true
          continue
        }
        if (++scanned > 500) {
          exhausted = true
          break
        }
        try {
          const file = await this.read(entry.path, 1, 300)
          // Search the full bounded file, not only the first read_file page.
          const raw = await this.raw(entry.path)
          if (
            (this.secret && redactToolText(raw, this.secret) !== raw) ||
            containsSecret.test(raw)
          ) {
            skipped++
            continue
          }
          void file
          const lines = raw.split(/\r\n|\n|\r/)
          for (let index = 0; index < lines.length; index++)
            if (lines[index].includes(value.query)) {
              matches.push({ path: entry.path, line: index + 1, text: lines[index].slice(0, 500) })
              if (matches.length > value.offset + value.limit) break
            }
        } catch (error) {
          if (this.signal.aborted) throw error
          skipped++
        }
        if (matches.length > value.offset + value.limit) break
      }
      if (exhausted) break
    }
    const more = exhausted || matches.length > value.offset + value.limit || queue.length > 0
    return {
      matches: matches.slice(value.offset, value.offset + value.limit),
      nextOffset:
        !exhausted && matches.length > value.offset + value.limit
          ? value.offset + value.limit
          : null,
      truncated: more,
      scanned,
      skipped,
      scanLimit: exhausted,
    }
  }
}
