import { sep } from 'node:path'
import { ToolFailure } from '../agent/tools'
type Ticket = {
  id: string
  root: string
  write: boolean
  signal: AbortSignal
  start: (release: () => void) => void
  reject: (error: Error) => void
  cleanup: () => void
}
export function overlapping(a: string, b: string) {
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep)
}
/** Whole-turn permits, independent of the short mutation critical section. */
export class RunQueue {
  private active = new Map<string, Ticket>()
  private waiting: Ticket[] = []
  constructor(readonly maximum = 4) {}
  async acquire(
    id: string,
    root: string,
    write: boolean,
    signal: AbortSignal,
  ): Promise<() => void> {
    signal.throwIfAborted()
    if (
      this.active.size + this.waiting.length >= 32 ||
      this.active.has(id) ||
      this.waiting.some((t) => t.id === id)
    )
      throw new ToolFailure('CALL_BUDGET')
    return new Promise((start, reject) => {
      const cancel = () => {
        const index = this.waiting.findIndex((t) => t.id === id)
        if (index >= 0) {
          const [ticket] = this.waiting.splice(index, 1)
          ticket.cleanup()
          reject(new ToolFailure('CANCELLED'))
          this.drain()
        }
      }
      const ticket: Ticket = {
        id,
        root,
        write,
        signal,
        start,
        reject,
        cleanup: () => signal.removeEventListener('abort', cancel),
      }
      signal.addEventListener('abort', cancel, { once: true })
      this.waiting.push(ticket)
      this.drain()
      if (signal.aborted) cancel()
    })
  }
  private drain() {
    for (let index = 0; index < this.waiting.length && this.active.size < this.maximum;) {
      const ticket = this.waiting[index]
      if (ticket.signal.aborted) {
        this.waiting.splice(index, 1)
        ticket.cleanup()
        ticket.reject(new ToolFailure('CANCELLED'))
        continue
      }
      const locked =
        ticket.write &&
        [...this.active.values(), ...this.waiting.slice(0, index)].some(
          (other) => other.write && overlapping(other.root, ticket.root),
        )
      if (locked) {
        index++
        continue
      }
      this.waiting.splice(index, 1)
      ticket.cleanup()
      this.active.set(ticket.id, ticket)
      let released = false
      ticket.start(() => {
        if (released) return
        released = true
        this.active.delete(ticket.id)
        this.drain()
      })
    }
  }
  status() {
    return {
      maximum: this.maximum,
      active: [...this.active.keys()],
      queued: this.waiting.map((t) => t.id),
    }
  }
}
