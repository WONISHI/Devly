import { createServer, request, type Server, type IncomingMessage } from 'node:http'
import { connect, type Socket } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { pinnedAddress } from '../web/network'
import { ToolFailure } from '../agent/tools'
/** Private authenticated proxy; CONNECT resolves once and dials that exact public IPv4. */
export class BrowserProxy {
  readonly password = randomBytes(24).toString('hex')
  private server: Server
  private sockets = new Set<Socket>()
  private controller = new AbortController()
  private bytes = 0
  private closed = false
  private closeTask: Promise<void> | undefined
  port = 0
  constructor(
    private origins: Set<string>,
    private previewOrigin: string | null,
  ) {
    this.server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
      if (!this.authorized(req)) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="Devly isolated browser"' })
        res.end()
        return
      }
      try {
        const url = new URL(req.url ?? '')
        if (
          this.closed ||
          !this.previewOrigin ||
          url.origin !== this.previewOrigin ||
          url.protocol !== 'http:' ||
          url.username ||
          url.password ||
          !['GET', 'HEAD'].includes(req.method ?? '') ||
          Number(req.headers['content-length'] ?? 0) > 0
        )
          throw new ToolFailure('BROWSER_ORIGIN_DENIED')
        const headers: Record<string, string | string[] | undefined> = {
          ...req.headers,
          host: url.host,
        }
        delete headers['proxy-authorization']
        delete headers['proxy-connection']
        delete headers.connection
        const upstream = request(
          url,
          { method: req.method, headers, agent: false, signal: this.controller.signal },
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers)
            response.on('data', (chunk) => this.consume(chunk.length))
            response.pipe(res)
            response.on('error', () => res.destroy())
          },
        )
        upstream.setTimeout(15000, () => upstream.destroy())
        upstream.on('error', () => {
          if (!res.headersSent) res.writeHead(502)
          res.end()
        })
        upstream.end()
      } catch {
        res.writeHead(403)
        res.end('Browser destination denied')
      }
    })
    this.server.on('connection', (socket) => {
      if (this.sockets.size >= 16 || this.closed) {
        socket.destroy()
        return
      }
      this.sockets.add(socket)
      socket.setTimeout(30000, () => socket.destroy())
      socket.on('close', () => this.sockets.delete(socket))
    })
    this.server.on('connect', (req, client, head) => {
      if (!this.authorized(req)) {
        client.end(
          'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Devly isolated browser"\r\nContent-Length: 0\r\n\r\n',
        )
        return
      }
      void (async () => {
        try {
          const url = new URL('https://' + req.url)
          if (
            this.closed ||
            url.pathname !== '/' ||
            url.search ||
            url.hash ||
            !this.origins.has(url.origin)
          )
            throw new ToolFailure('BROWSER_ORIGIN_DENIED')
          const address = await pinnedAddress(url, false, this.controller.signal)
          if (this.closed || client.destroyed) return
          const upstream = connect({ host: address, port: 443, family: 4 })
          this.sockets.add(upstream)
          upstream.setTimeout(15000, () => upstream.destroy())
          upstream.once('connect', () => {
            if (this.closed) {
              upstream.destroy()
              return
            }
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            if (head.length) upstream.write(head)
            client.pipe(upstream)
            upstream.pipe(client)
          })
          upstream.on('data', (chunk) => this.consume(chunk.length))
          client.on('data', (chunk) => this.consume(chunk.length))
          client.on('error', () => upstream.destroy())
          client.on('close', () => upstream.destroy())
          upstream.on('error', () => client.destroy())
          upstream.on('close', () => {
            this.sockets.delete(upstream)
            client.destroy()
          })
        } catch {
          client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n')
        }
      })()
    })
    this.server.headersTimeout = 5000
    this.server.requestTimeout = 15000
  }
  private consume(length: number) {
    this.bytes += length
    if (this.bytes > 16 * 1024 * 1024) void this.close()
  }
  private authorized(req: IncomingMessage) {
    const supplied = Buffer.from(String(req.headers['proxy-authorization'] ?? '')),
      expected = Buffer.from('Basic ' + Buffer.from(`devly:${this.password}`).toString('base64'))
    return supplied.length === expected.length && timingSafeEqual(supplied, expected)
  }
  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', () => resolve())
    })
    this.port = (this.server.address() as { port: number }).port
    return this
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closed = true
    this.controller.abort()
    for (const socket of this.sockets) socket.destroy()
    this.server.closeAllConnections()
    this.closeTask = new Promise<void>((resolve) => this.server.close(() => resolve()))
    return this.closeTask
  }
}
