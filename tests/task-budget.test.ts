import { expect, it } from 'vitest'
import { TaskBudget } from '../src/main/extensions/budget'
import { childRequest } from '../src/main/extensions/delegation'
it('child reservations reduce the parent before execution and return only unused credits once', () => {
  const parent = new TaskBudget({ tokens: 1000, calls: 10, outputChars: 10000, durationMs: 10000 })
  parent.tokens(100)
  parent.call()
  const child = parent.reserve({ tokens: 400, calls: 4, outputChars: 4000, durationMs: 5000 })
  expect(parent.remaining().tokens).toBe(500)
  expect(parent.remaining().calls).toBe(5)
  child.budget.tokens(150)
  child.budget.call()
  child.budget.output(200)
  child.release()
  child.release()
  expect(parent.remaining().tokens).toBe(750)
  expect(parent.remaining().calls).toBe(8)
  expect(parent.remaining().outputChars).toBe(9800)
  expect(() => child.budget.tokens(1)).toThrow('TIME_BUDGET')
})
it('over-budget, expired and third child reservations cannot expand the parent budget', () => {
  const parent = new TaskBudget({ tokens: 1000, calls: 10, outputChars: 10000, durationMs: 10000 })
  expect(() =>
    parent.reserve({ tokens: 1001, calls: 1, outputChars: 1000, durationMs: 5000 }),
  ).toThrow('CHILD_BUDGET')
  for (let i = 0; i < 2; i++)
    parent.reserve({ tokens: 100, calls: 1, outputChars: 1000, durationMs: 5000 }).release()
  expect(() => parent.reserve({ tokens: 1, calls: 1, outputChars: 1, durationMs: 1 })).toThrow(
    'CHILD_BUDGET',
  )
  const expired = new TaskBudget(
    { tokens: 100, calls: 1, outputChars: 100, durationMs: 1000 },
    Date.now() - 1,
  )
  expect(() => expired.call()).toThrow('TIME_BUDGET')
})
it('delegation parameters cannot change provider, host directory or recursively enable children', () => {
  const task = {
    text: 'inspect file',
    mode: 'read-only',
    maxTokens: 1000,
    maxCalls: 2,
    maxOutputChars: 4000,
    maxDurationMs: 5000,
  }
  expect(childRequest.safeParse({ tasks: [task] }).success).toBe(true)
  for (const injected of [
    { providerId: 'other' },
    { directory: '/outside' },
    { allowDelegation: true },
  ])
    expect(childRequest.safeParse({ tasks: [{ ...task, ...injected }] }).success).toBe(false)
})
