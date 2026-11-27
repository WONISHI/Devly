import { expect, it } from 'vitest'
import { publicV4, pinnedAddress } from '../src/main/web/network'
import { webInput, browserOrigin } from '../src/shared/web-contracts'
it('blocks private, metadata, reserved and transition addresses before making a request', async () => {
  for (const address of [
    '127.0.0.1',
    '0.0.0.0',
    '10.0.0.1',
    '172.16.1.2',
    '192.168.2.3',
    '169.254.169.254',
    '100.64.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    expect(publicV4(address)).toBe(false)
  expect(publicV4('93.184.216.34')).toBe(true)
  for (const url of [
    'file:///etc/passwd',
    'http://example.com',
    'https://2130706433',
    'https://127.0.0.1',
    'https://169.254.169.254',
    'https://example.com:8443',
    'https://a:b@example.com',
  ])
    await expect(pinnedAddress(new URL(url))).rejects.toThrow()
})
it('keeps browser authority separate, canonicalizes exact origins and refuses private/credential/path-bearing permissions', () => {
  for (const url of [
    'http://example.com',
    'https://127.0.0.1',
    'https://2130706433',
    'https://169.254.169.254',
    'https://localhost',
    'https://host.local',
    'https://a:b@example.com',
    'https://example.com/path',
    'https://example.com:8443',
    'https://example.com/?key=abc',
  ])
    expect(browserOrigin.safeParse(url).success).toBe(false)
  expect(browserOrigin.parse('https://example.com/')).toBe('https://example.com')
  const config = webInput.parse({
    projectId: 'df25c48a-520c-4f1e-83b4-d4e39cb3d0c4',
    fetchEnabled: true,
  })
  expect(config.browserEnabled).toBe(false)
  expect(config.browserOrigins).toEqual([])
})
it('requires explicit fixed search endpoint configuration and rejects embedded secrets or query templates', () => {
  const projectId = 'df25c48a-520c-4f1e-83b4-d4e39cb3d0c4'
  for (const searchUrl of [
    'https://secret@example.com/search',
    'https://example.com/search?key=abc',
    'http://192.168.0.1/search',
    'file:///tmp/search',
  ])
    expect(webInput.safeParse({ projectId, searchUrl }).success).toBe(false)
  expect(webInput.parse({ projectId }).fetchEnabled).toBe(false)
  expect(
    webInput.parse({ projectId, searchUrl: 'http://127.0.0.1:1234/search' }).searchEnabled,
  ).toBe(false)
})
