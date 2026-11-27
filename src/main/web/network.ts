import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { isIP } from 'node:net'
import { ToolFailure } from '../agent/tools'
import { publicAddressV4 } from '../../shared/web-contracts'
export function publicV4(ip: string): boolean {
  return publicAddressV4(ip)
}
export async function pinnedAddress(
  url: URL,
  localService = false,
  signal?: AbortSignal,
): Promise<string> {
  if (url.username || url.password || url.hash || url.href.length > 4096)
    throw new ToolFailure('WEB_URL_DENIED')
  if (localService && url.protocol === 'http:' && url.hostname === '127.0.0.1') return '127.0.0.1'
  if (url.protocol !== 'https:' || (url.port && url.port !== '443'))
    throw new ToolFailure('WEB_URL_DENIED')
  const dnsSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
    : AbortSignal.timeout(5000)
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
        const abort = () => reject(new ToolFailure('WEB_DNS_CANCELLED_OR_TIMEOUT'))
        dnsSignal.addEventListener('abort', abort, { once: true })
        if (dnsSignal.aborted) abort()
        void lookup(url.hostname, { all: true, family: 4 })
          .then(resolve, reject)
          .finally(() => dnsSignal.removeEventListener('abort', abort))
      })
  // Do not allow a mixed public/private DNS answer, nor IPv6 transition/local routes.
  if (!addresses.length || addresses.some((a) => a.family !== 4 || !publicV4(a.address)))
    throw new ToolFailure('WEB_ADDRESS_DENIED')
  return addresses[0].address
}
export async function boundedGet(
  url: URL,
  signal: AbortSignal,
  headers: Record<string, string> = {},
  localService = false,
  beforeConnect?: () => Promise<boolean>,
) {
  signal.throwIfAborted()
  const address = await pinnedAddress(url, localService, signal)
  signal.throwIfAborted()
  if (beforeConnect && !(await beforeConnect())) throw new ToolFailure('PERMISSION_DENIED')
  signal.throwIfAborted()
  return new Promise<{
    status: number
    headers: import('node:http').IncomingHttpHeaders
    bytes: Buffer
  }>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        signal,
        agent: false,
        family: 4,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: { 'user-agent': 'Devly/0.1', 'accept-encoding': 'identity', ...headers },
      },
      (response) => {
        let size = 0
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 2 * 1024 * 1024) response.destroy(new ToolFailure('WEB_SIZE_LIMIT'))
          else chunks.push(chunk)
        })
        response.on('error', reject)
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
          }),
        )
      },
    )
    request.on('error', reject)
    request.setTimeout(15000, () => request.destroy(new ToolFailure('WEB_TIMEOUT')))
    request.end()
  })
}
