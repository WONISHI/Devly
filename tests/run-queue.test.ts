import { expect, it } from 'vitest'
import { RunQueue } from '../src/main/extensions/queue'
it('serializes overlapping directory writers while admitting isolated workspaces within the limit', async () => {
  const q = new RunQueue(2),
    signal = new AbortController().signal
  const a = await q.acquire('a', '/project', true, signal)
  let bStarted = false
  const b = q.acquire('b', '/project/sub', true, signal).then((release) => {
    bStarted = true
    return release
  })
  const c = await q.acquire('c', '/isolated', true, signal)
  expect(q.status()).toEqual({ maximum: 2, active: ['a', 'c'], queued: ['b'] })
  expect(bStarted).toBe(false)
  a()
  const endB = await b
  expect(bStarted).toBe(true)
  endB()
  c()
  expect(q.status().active).toEqual([])
})
it('cancelling a queued item settles only that ticket, never releases another running permit', async () => {
  const q = new RunQueue(1),
    controller = new AbortController()
  const active = await q.acquire('active', '/a', true, new AbortController().signal)
  const queued = q.acquire('queued', '/a', true, controller.signal)
  controller.abort()
  await expect(queued).rejects.toThrow('CANCELLED')
  expect(q.status().active).toEqual(['active'])
  expect(q.status().queued).toEqual([])
  active()
  active()
})
