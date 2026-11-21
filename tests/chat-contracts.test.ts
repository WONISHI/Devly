import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { operationArgs, dataPayloadSchema } from '../src/shared/data-contracts'
import { canTransition } from '../src/shared/chat-contracts'
import { SecretRedactor } from '../src/main/chat/redactor'
const scope = {
  projectId: randomUUID(),
  sessionId: randomUUID(),
  turnId: randomUUID(),
  expectedProviderId: randomUUID(),
  expectedModel: 'model',
}
it('accepts bounded scoped chat input and rejects provider/secret/SQL injection in its envelope', () => {
  expect(operationArgs['chat.start'].parse({ ...scope, text: ' hello ' }).text).toBe('hello')
  for (const args of [
    { ...scope, text: ' ' },
    { ...scope, text: 'x'.repeat(32769) },
    { ...scope, text: 'a', key: 'secret' },
    { ...scope, text: 'a', providerId: randomUUID() },
    { ...scope, text: 'a', sessionId: 'other' },
  ])
    expect(dataPayloadSchema.safeParse({ operation: 'chat.start', args }).success).toBe(false)
})
it('requires explicit history permission when switching and rejects secret-bearing binding metadata', () => {
  const args = {
    projectId: scope.projectId,
    sessionId: scope.sessionId,
    providerId: randomUUID(),
    model: 'model',
  }
  expect(operationArgs['sessions.bind'].parse(args).allowHistory).toBe(false)
  expect(operationArgs['sessions.bind'].safeParse({ ...args, apiKey: 'no' }).success).toBe(false)
})
it('terminal phases cannot restart and approval/stop transitions have explicit paths', () => {
  expect(canTransition('running', 'waiting_approval')).toBe(true)
  expect(canTransition('waiting_approval', 'running')).toBe(true)
  expect(canTransition('stopping', 'cancelled')).toBe(true)
  expect(canTransition('stopping', 'completed')).toBe(false)
  for (const state of ['completed', 'failed', 'cancelled'] as const)
    expect(canTransition(state, 'running')).toBe(false)
})
it('redacts an echoed key for every possible split before publishing stream fragments', () => {
  const secret = 'sk-never-display-this-key'
  for (let split = 1; split < secret.length; split++) {
    const redact = new SecretRedactor(secret)
    const prefix = redact.push(`before ${secret.slice(0, split)}`)
    expect(prefix).toBe('before ')
    const visible = prefix + redact.push(`${secret.slice(split)} after`) + redact.finish()
    expect(visible).toBe('before [REDACTED] after')
    expect(visible).not.toContain(secret)
  }
})
it('retains ordinary streaming text and handles repeated keys, partial echoes and keyless endpoints', () => {
  const redact = new SecretRedactor('secret-123456')
  expect(redact.push('hello secret-123456 secret-123456 ok') + redact.finish()).toBe(
    'hello [REDACTED] [REDACTED] ok',
  )
  const incomplete = new SecretRedactor('secret-123456')
  expect(incomplete.push('hello secret-') + incomplete.finish()).toBe('hello [REDACTED]')
  const keyless = new SecretRedactor('')
  expect(keyless.push('all text') + keyless.finish()).toBe('all text')
})
