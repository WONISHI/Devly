import { expect, it } from 'vitest'
import { parseCommits } from '../src/main/git/service'
import { operationArgs } from '../src/shared/data-contracts'
import { randomUUID } from 'node:crypto'
it('preserves NUL-delimited real author names, subjects, hash and timestamps across records', () => {
  const hash = 'a'.repeat(40),
    other = 'b'.repeat(40)
  const rows = parseCommits(
    Buffer.from(
      `${hash}\0中文 作者\0a@example.invalid\0${1700000000}\0hello | subject\0\n${other}\0Second\0b@example.invalid\0${1700000001}\0second\0\n`,
    ),
  )
  expect(rows.map((r) => r.hash)).toEqual([hash, other])
  expect(rows[0].author).toBe('中文 作者')
  expect(rows[0].timestamp).toBe(1700000000000)
  expect(rows[0].subject).toBe('hello | subject')
})
it('accepts only explicit local Git operations with a bounded reviewed scope', () => {
  const projectId = randomUUID()
  expect(
    operationArgs['git.branch'].safeParse({
      projectId,
      token: 'a',
      name: '--force',
      action: 'switch',
    }).success,
  ).toBe(false)
  expect(
    operationArgs['git.branch'].safeParse({ projectId, token: 'a', name: 'main', action: 'push' })
      .success,
  ).toBe(false)
  expect(
    operationArgs['git.stage'].safeParse({ projectId, token: 'a', paths: [], staged: true })
      .success,
  ).toBe(false)
  expect(
    operationArgs['git.commit'].safeParse({
      projectId,
      token: 'a',
      message: 'commit',
      author: 'a\nb',
      email: 'a@example.invalid',
    }).success,
  ).toBe(false)
})
