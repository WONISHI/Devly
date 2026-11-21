import { parentPort, workerData, threadId } from 'node:worker_threads'
import { ContractError, failure } from '../../shared/contracts'
import { DataStore } from './store'

if (!parentPort) throw new Error('Database entry requires a Worker')
const port = parentPort
let store: DataStore
try {
  store = await DataStore.open(String(workerData.root))
  port.postMessage({ ready: true, threadId })
  let queue = Promise.resolve()
  port.on('message', (request: { id: string; operation: string; args: unknown }) => {
    queue = queue.then(async () => {
      try {
        if (request.operation === 'internal.close') {
          store.close()
          port.postMessage({ id: request.id, ok: true, data: null })
          port.close()
          return
        }
        const data =
          request.operation === 'internal.blob.put'
            ? await store.putBlob(request.args)
            : await store.execute(request.operation, request.args)
        port.postMessage({ id: request.id, ok: true, data })
      } catch (error) {
        port.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof ContractError ? error.info : failure('STORAGE_UNAVAILABLE'),
        })
      }
    })
  })
} catch {
  port.postMessage({ ready: false, error: failure('STORAGE_UNAVAILABLE') })
  port.close()
}
