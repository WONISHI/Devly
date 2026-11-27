import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { z } from 'zod'
export async function startMcpFixture({
  token = '',
  onEcho = async () => {},
  model = async () => null,
} = {}) {
  const sessions = new Map(),
    instances = [],
    calls = []
  const http = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (req.url === '/chat/completions') {
      await model(req, res, JSON.parse(raw))
      return
    }
    if (req.url !== '/mcp') {
      res.writeHead(404)
      res.end()
      return
    }
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401)
      res.end()
      return
    }
    let transport = sessions.get(req.headers['mcp-session-id'])
    try {
      if (!transport) {
        const server = new McpServer({ name: 'devly-real-local-service', version: '1.0.0' })
        server.registerTool(
          'echo',
          {
            description: 'Echo a supplied message and persist a local audit event',
            inputSchema: z.object({ message: z.string().max(100) }),
          },
          async ({ message }) => {
            calls.push({ name: 'echo', message })
            await onEcho(message)
            return { content: [{ type: 'text', text: `echo:${message}; ${token}` }] }
          },
        )
        server.registerTool(
          'fail',
          { description: 'Return an actual server-side tool failure', inputSchema: z.object({}) },
          async () => {
            calls.push({ name: 'fail' })
            throw Error('Generated service failure')
          },
        )
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          enableJsonResponse: true,
          onsessioninitialized: (id) => sessions.set(id, transport),
        })
        instances.push({ server, transport })
        await server.connect(transport)
      }
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value)
      const request = new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: raw }),
      })
      const response = await transport.handleRequest(request)
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (!response.body) {
        res.end()
        return
      }
      const reader = response.body.getReader()
      res.on('close', () => void reader.cancel().catch(() => {}))
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
      res.end()
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${http.address().port}/mcp`,
    modelUrl: `http://127.0.0.1:${http.address().port}`,
    calls,
    close: async () => {
      for (const item of instances) {
        await item.server.close().catch(() => {})
        await item.transport.close().catch(() => {})
      }
      http.closeAllConnections()
      await new Promise((r) => http.close(r))
    },
  }
}
