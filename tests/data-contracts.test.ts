import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  operationArgs,
  providerInputSchema,
  providerSchema,
  settingsSchema,
  dataPayloadSchema,
} from '../src/shared/data-contracts'
import { requestSchema } from '../src/shared/contracts'
import { randomUUID } from 'node:crypto'

describe('local data boundary', () => {
  it('rejects settings secrets, invalid versions, permissions and budgets', () => {
    for (const value of [
      { ...defaultSettings, apiKey: 'not-allowed' },
      { ...defaultSettings, version: 2 },
      { ...defaultSettings, maxTokens: -1 },
      { ...defaultSettings, maxCost: Infinity },
      { ...defaultSettings, projectPermission: 'full-access' },
    ])
      expect(settingsSchema.safeParse(value).success).toBe(false)
  })
  it('does not allow keys in provider metadata or credential IPC', () => {
    const value = {
      name: 'test',
      protocol: 'chat-completions',
      baseUrl: 'https://example.com/v1',
      model: 'test',
    }
    expect(providerInputSchema.safeParse(value).success).toBe(true)
    expect(providerInputSchema.safeParse({ ...value, apiKey: 'no' }).success).toBe(false)
    expect(
      providerSchema.safeParse({
        ...value,
        id: randomUUID(),
        hasCredential: true,
        credentialRef: randomUUID(),
      }).success,
    ).toBe(false)
    expect(
      operationArgs['credentials.set'].safeParse({ providerId: randomUUID(), key: 'no' }).success,
    ).toBe(false)
  })
  it.each([
    'file:///tmp/key',
    'https://key@example.com',
    'https://example.com?key=secret',
    'https://example.com/#secret',
  ])('rejects credential-bearing or non-HTTP endpoints: %s', (baseUrl) => {
    expect(
      providerInputSchema.safeParse({ name: 'test', protocol: 'responses', baseUrl, model: '' })
        .success,
    ).toBe(false)
  })
  it('rejects unbounded pagination, arbitrary SQL/paths and invalid project IDs', () => {
    const projectId = randomUUID(),
      sessionId = randomUUID()
    for (const payload of [
      { operation: 'sql', args: { query: 'select 1' } },
      { operation: 'sessions.list', args: { projectId, limit: 1000 } },
      { operation: 'sessions.list', args: { projectId: 'other' } },
      {
        operation: 'blobs.read',
        args: { projectId, sessionId, blobId: randomUUID(), length: 1000000 },
      },
      {
        operation: 'blobs.import',
        args: { projectId, sessionId, kind: 'log', sourcePath: '/secret' },
      },
    ])
      expect(dataPayloadSchema.safeParse(payload).success).toBe(false)
  })
  it('enforces operation-specific arguments inside the versioned IPC envelope', () => {
    expect(
      requestSchema.safeParse({
        version: 1,
        requestId: randomUUID(),
        method: 'data.execute',
        payload: { operation: 'bootstrap', args: {} },
      }).success,
    ).toBe(true)
    expect(
      requestSchema.safeParse({
        version: 1,
        requestId: randomUUID(),
        method: 'data.execute',
        payload: {
          operation: 'credentials.set',
          args: { providerId: randomUUID(), plaintext: 'no' },
        },
      }).success,
    ).toBe(false)
  })
})
