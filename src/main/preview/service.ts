import { createServer, type Server } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { open, realpath, lstat } from 'node:fs/promises'
import { join, extname, dirname, basename } from 'node:path'
import { constants } from 'node:fs'
import type { BrowserWindow, Session } from 'electron'
import type { DatabaseClient } from '../data/client'
import type { RecentProject } from '../../shared/data-contracts'
import { ReadOnlyToolbox, ToolFailure, redactToolText } from '../agent/tools'
type Live = {
  projectId: string
  owner: string
  url: string
  entry: string
  startedAt: number
  kind: 'static-isolated'
  server: Server
  window?: BrowserWindow
  session?: Session
}
const types: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
}
export class PreviewService {
  private live = new Map<string, Live>()
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  status(projectId: string) {
    const value = this.live.get(projectId)
    return value
      ? {
          projectId: value.projectId,
          url: value.url,
          entry: value.entry,
          startedAt: value.startedAt,
          kind: value.kind,
        }
      : null
  }
  async stop(projectId: string) {
    const value = this.live.get(projectId)
    if (!value) return { removed: false }
    this.live.delete(projectId)
    value.window?.destroy()
    value.server.closeAllConnections()
    await new Promise<void>((resolve) => value.server.close(() => resolve()))
    await value.session?.clearStorageData().catch(() => {})
    return { removed: true }
  }
  async clearOwner(owner: string) {
    await Promise.all(
      [...this.live.values()].filter((v) => v.owner === owner).map((v) => this.stop(v.projectId)),
    )
  }
  async close() {
    await Promise.all([...this.live.keys()].map((id) => this.stop(id)))
  }
  async start(projectId: string, entry: string, owner: string, active: () => boolean) {
    if (this.live.has(projectId)) await this.stop(projectId)
    if (this.live.size >= 2) throw new ToolFailure('PREVIEW_LIMIT')
    const project = (await this.database.execute<RecentProject[]>('projects.list', {})).find(
      (p) => p.id === projectId && !p.managed,
    )
    if (!project || (await realpath(project.path)) !== project.path)
      throw new ToolFailure('PROJECT_UNAVAILABLE')
    if (
      entry.startsWith('/') ||
      entry.includes('\\') ||
      entry.includes('\0') ||
      entry
        .split('/')
        .some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            ['.git', '.ssh', '.aws', '.codex', '.agents', '.claude', 'node_modules'].includes(
              part.toLowerCase(),
            ),
        ) ||
      entry.split('/').length > 16
    )
      throw new ToolFailure('PREVIEW_ENTRY_DENIED')
    let ancestor = project.path
    for (const part of entry.split('/').slice(0, -1)) {
      ancestor = join(ancestor, part)
      const info = await lstat(ancestor)
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new ToolFailure('PREVIEW_ENTRY_DENIED')
    }
    const serveRoot = dirname(join(project.path, entry)),
      entryName = basename(entry)
    const toolbox = await ReadOnlyToolbox.create(serveRoot, new AbortController().signal)
    const encoded = encodeURIComponent(entryName)
    if (
      !/\.html?$/i.test(entry) ||
      encoded.length > 3000 ||
      !(await toolbox.pathAllowed(entryName))
    )
      throw new ToolFailure('PREVIEW_ENTRY_DENIED')
    const token = randomBytes(24).toString('hex')
    const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405)
          res.end()
          return
        }
        const port = (server.address() as { port: number }).port
        if (req.headers.host !== `127.0.0.1:${port}`) {
          res.writeHead(403)
          res.end()
          return
        }
        const raw = req.url ?? '/',
          prefix = `/${token}/`
        if (raw.startsWith(prefix)) {
          res.writeHead(302, {
            'Set-Cookie': `devly-preview=${token}; HttpOnly; SameSite=Strict; Path=/`,
            Location: '/' + raw.slice(prefix.length),
            'Cache-Control': 'no-store',
          })
          res.end()
          return
        }
        if (!req.headers.cookie?.split(';').some((v) => v.trim() === `devly-preview=${token}`)) {
          res.writeHead(403)
          res.end()
          return
        }
        const path = decodeURIComponent(raw.split('?')[0]).replace(/^\//, '') || entryName
        if (!(await toolbox.pathAllowed(path))) throw new ToolFailure('PATH_DENIED')
        const mime = types[extname(path).toLowerCase()]
        if (!mime) throw new ToolFailure('PREVIEW_CONTENT_TYPE')
        const canonical = await realpath(join(serveRoot, path))
        if (!canonical.startsWith(serveRoot + '/')) throw new ToolFailure('PATH_DENIED')
        const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW)
        let bytes: Buffer
        try {
          const stat = await file.stat()
          if (!stat.isFile() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024)
            throw new ToolFailure('FILE_DENIED')
          const buffer = Buffer.alloc(2 * 1024 * 1024 + 1)
          let size = 0
          while (size < buffer.length) {
            const chunk = await file.read(buffer, size, buffer.length - size, size)
            if (!chunk.bytesRead) break
            size += chunk.bytesRead
          }
          if (size > 2 * 1024 * 1024 || (await realpath(join(serveRoot, path))) !== canonical)
            throw new ToolFailure('FILE_CHANGED')
          bytes = buffer.subarray(0, size)
        } finally {
          await file.close()
        }
        if (
          (mime.startsWith('text/') || mime === 'application/json' || mime === 'image/svg+xml') &&
          redactToolText(bytes.toString('utf8')) !== bytes.toString('utf8')
        )
          throw new ToolFailure('SENSITIVE_CONTENT')
        res.writeHead(200, {
          'content-type': mime,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
          'Content-Security-Policy':
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'; worker-src 'none'",
        })
        res.end(req.method === 'HEAD' ? undefined : bytes)
      } catch {
        if (!res.headersSent) res.writeHead(403, { 'content-type': 'text/plain' })
        res.end('Preview resource unavailable or protected')
      }
    })
    server.requestTimeout = 10000
    server.headersTimeout = 10000
    server.keepAliveTimeout = 1000
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const port = (server.address() as { port: number }).port,
      url = `http://127.0.0.1:${port}/${token}/${encoded}`
    const value: Live = {
      projectId,
      owner,
      url,
      entry,
      startedAt: Date.now(),
      kind: 'static-isolated',
      server,
    }
    this.live.set(projectId, value)
    try {
      if (!active()) throw new ToolFailure('CANCELLED')
      const { BrowserWindow, session } = await import('electron')
      const isolated = session.fromPartition(`devly-preview-${randomUUID()}`, { cache: false })
      value.session = isolated
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      isolated.setPermissionCheckHandler(() => false)
      isolated.setDevicePermissionHandler(() => false)
      isolated.setDisplayMediaRequestHandler((_request, callback) => callback({}))
      isolated.on('will-download', (event) => event.preventDefault())
      const origin = new URL(url).origin
      isolated.webRequest.onBeforeRequest((details, callback) => {
        let allowed = false
        try {
          const target = new URL(details.url)
          allowed =
            target.origin === origin &&
            target.protocol === 'http:' &&
            !target.username &&
            !target.password
        } catch {
          /*deny*/
        }
        callback({ cancel: !allowed })
      })
      const window = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 640,
        minHeight: 480,
        title: 'Devly 隔离静态预览',
        webPreferences: {
          session: isolated,
          nodeIntegration: false,
          nodeIntegrationInSubFrames: false,
          nodeIntegrationInWorker: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
          plugins: false,
          spellcheck: false,
          devTools: false,
          navigateOnDragDrop: false,
        },
      })
      value.window = window
      window.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-attach-webview', (event) => event.preventDefault())
      window.webContents.on('page-title-updated', (event) => event.preventDefault())
      window.on('closed', () => {
        value.window = undefined
        if (this.live.get(projectId) === value) void this.stop(projectId)
      })
      await window.loadURL(url)
      if (!active()) throw new ToolFailure('CANCELLED')
      return this.status(projectId)!
    } catch (error) {
      await this.stop(projectId)
      throw error
    }
  }
}
