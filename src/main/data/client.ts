import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ContractError, failure, type ErrorInfo } from '../../shared/contracts'

export { migrations, applyMigrations } from './migrations'
export class DatabaseClient {
  private worker: Worker
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private failed = false
  private closing = false
  private closeTask: Promise<void> | null = null
  readonly ready: Promise<number>
  constructor(
    root: string,
    workerPath = fileURLToPath(new URL('./database-worker.js', import.meta.url)),
  ) {
    this.worker = new Worker(workerPath, { workerData: { root } })
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.fail()
        reject(new ContractError(failure('STORAGE_UNAVAILABLE')))
      }, 15000)
      this.worker.once('message', (message) => {
        clearTimeout(timeout)
        if (message.ready) resolve(message.threadId)
        else {
          this.fail()
          reject(new ContractError(failure('STORAGE_UNAVAILABLE')))
        }
      })
      this.worker.once('error', () => {
        clearTimeout(timeout)
        this.fail()
        reject(new ContractError(failure('STORAGE_UNAVAILABLE')))
      })
      this.worker.once('exit', () => {
        clearTimeout(timeout)
        if (!this.closing) {
          this.fail()
          reject(new ContractError(failure('STORAGE_UNAVAILABLE')))
        }
      })
    })
    this.worker.on(
      'message',
      (message: { id?: string; ok: boolean; data?: unknown; error: ErrorInfo }) => {
        if (!message.id) return
        const entry = this.pending.get(message.id)
        if (!entry) return
        this.pending.delete(message.id)
        clearTimeout(entry.timer)
        if (message.ok) entry.resolve(message.data)
        else entry.reject(new ContractError(message.error))
      },
    )
    this.worker.on('error', () => this.fail())
    this.worker.on('exit', () => {
      if (!this.closing) this.fail()
    })
  }
  isAvailable(): boolean {
    return !this.failed && !this.closing
  }
  private fail(): void {
    this.failed = true
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.reject(new ContractError(failure('STORAGE_UNAVAILABLE')))
    }
    this.pending.clear()
    void this.worker.terminate()
  }
  async execute<T = unknown>(operation: string, args: unknown = {}): Promise<T> {
    if (
      [
        'internal.chat.update',
        'internal.chat.tool',
        'internal.chat.agent',
        'internal.chat.approval',
      ].includes(operation)
    ) {
      const value = args as Record<string, unknown>
      args = { ...value, eventId: value.eventId ?? randomUUID() }
    }
    await this.ready
    if (this.failed || (this.closing && operation !== 'internal.close'))
      throw new ContractError(failure('STORAGE_UNAVAILABLE'))
    if (this.pending.size >= 128) throw new ContractError(failure('LIMIT_EXCEEDED'))
    const id = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(), 15000)
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })
      this.worker.postMessage({ id, operation, args })
    })
  }
  async close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closing = true
    this.closeTask = (async () => {
      const exited = new Promise<void>((resolve) => this.worker.once('exit', () => resolve()))
      let graceful = false
      try {
        if (!this.failed) {
          await this.execute('internal.close')
          graceful = true
        }
      } finally {
        if (graceful) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const stopped = await Promise.race([
            exited.then(() => true),
            new Promise<false>((resolve) => {
              timer = setTimeout(() => resolve(false), 3000)
            }),
          ])
          clearTimeout(timer)
          if (!stopped) await this.worker.terminate()
        } else await this.worker.terminate()
      }
    })()
    return this.closeTask
  }
}
