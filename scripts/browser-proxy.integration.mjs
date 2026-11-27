import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { BrowserProxy } from '../out/main/browser-proxy.js'
let hits = 0
const source = createServer((_req, res) => {
  hits++
  res.end('REAL_LOCAL_PREVIEW')
})
await new Promise((r) => source.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${source.address().port}`,
  proxy = await new BrowserProxy(
    new Set(['https://127.0.0.1', 'https://169.254.169.254']),
    origin,
  ).start()
const auth = 'Basic ' + Buffer.from('devly:' + proxy.password).toString('base64')
function get(url, authorized = true) {
  return new Promise((resolve, reject) => {
    const r = request(
      {
        host: '127.0.0.1',
        port: proxy.port,
        path: url,
        headers: authorized ? { 'Proxy-Authorization': auth } : {},
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    r.on('error', reject)
    r.end()
  })
}
async function tunnel(destination) {
  return new Promise((resolve, reject) => {
    const s = connect(proxy.port, '127.0.0.1', () =>
      s.write(
        `CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\nProxy-Authorization: ${auth}\r\n\r\n`,
      ),
    )
    s.once('data', (d) => {
      resolve(d.toString())
      s.destroy()
    })
    s.on('error', reject)
    s.setTimeout(6000, () => {
      s.destroy()
      reject(Error('timeout'))
    })
  })
}
try {
  assert.equal((await get(origin, false)).status, 407)
  assert.equal(hits, 0)
  assert.deepEqual(await get(origin), { status: 200, body: 'REAL_LOCAL_PREVIEW' })
  assert.equal((await get('http://127.0.0.1:1/')).status, 403)
  for (const target of ['127.0.0.1:443', '169.254.169.254:443', 'example.com:443'])
    assert.ok((await tunnel(target)).startsWith('HTTP/1.1 403'))
  assert.equal(hits, 1)
  await proxy.close()
  await assert.rejects(get(origin))
  console.log(
    'PASS authenticated real HTTP proxy; unauthorized/private/foreign CONNECT denied; exact preview only; closed socket unreachable',
  )
} finally {
  await proxy.close()
  source.closeAllConnections()
  await new Promise((r) => source.close(r))
}
