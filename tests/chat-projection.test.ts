import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { chatTurnSchema, type ChatSnapshot } from '../src/shared/chat-contracts'
import { messageSchema } from '../src/shared/data-contracts'
import { acceptStart, projectMessages } from '../src/renderer/src/features/chat/projection'
const turn = chatTurnSchema.parse({
  id: randomUUID(),
  projectId: randomUUID(),
  sessionId: randomUUID(),
  providerId: randomUUID(),
  model: 'fixture',
  state: 'running',
  phase: 'running',
  userMessageId: randomUUID(),
  assistantMessageId: randomUUID(),
  startedAt: 1,
  endedAt: null,
  usage: null,
  finish: null,
  error: null,
})
it('a late start acknowledgement never regresses the matching streaming or terminal poll', () => {
  for (const state of ['running', 'completed', 'failed', 'cancelled'] as const) {
    const final: ChatSnapshot = {
      sequence: 9,
      turn: { ...turn, state, phase: state },
      text: 'retained',
      tools: [],
    }
    expect(acceptStart(final, turn, 9)).toBe(final)
  }
  expect(acceptStart({ sequence: 0, turn: null, text: '', tools: [] }, turn, 0).turn).toBe(turn)
})
it('an older page cannot replace the latest observed assistant content or terminal state', () => {
  const message = messageSchema.parse({
    id: turn.assistantMessageId,
    sessionId: turn.sessionId,
    role: 'assistant',
    createdAt: 1,
    turnId: turn.id,
    state: 'running',
    parts: [{ id: randomUUID(), type: 'text', text: 'partial', blobId: null }],
  })
  const final: ChatSnapshot = {
    sequence: 10,
    turn: { ...turn, state: 'failed', phase: 'failed' },
    text: 'final retained text',
    tools: [],
  }
  const projected = projectMessages([message], final)
  expect(projected[0].state).toBe('failed')
  expect(projected[0].parts[0].text).toBe('final retained text')
  expect(projectMessages([message], { sequence: 0, turn: null, text: '', tools: [] })[0]).toBe(
    message,
  )
})
