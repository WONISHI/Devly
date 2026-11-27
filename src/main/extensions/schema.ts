import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
export async function validSchema(
  schema: Record<string, unknown>,
  input: unknown,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (JSON.stringify(schema).length > 16384 || JSON.stringify(input).length > 262144) return false
  return new Promise((done) => {
    const worker = new Worker(fileURLToPath(new URL('./schema-worker.js', import.meta.url)), {
      workerData: { schema, input },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    })
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      void worker.terminate()
      done(value)
    }
    const timer = setTimeout(() => finish(false), 2000),
      abort = () => finish(false)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    worker.once('message', (result) => finish(result.valid === true))
    worker.once('error', () => finish(false))
    worker.once('exit', () => finish(false))
  })
}
