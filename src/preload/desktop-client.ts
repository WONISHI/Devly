import {
  ContractError,
  decodeResponse,
  eventSchema,
  failure,
  type DesktopClient,
  type EnvironmentEvent,
  type EnvironmentInfo,
  type Project,
  type Request,
} from '../shared/contracts'

import type { DataArgs, DataOperation, DataResult } from '../shared/data-contracts'

export interface Transport {
  invoke(request: Request): Promise<unknown>
  listen(listener: (raw: unknown) => void): () => void
}
export function createDesktopClient(transport: Transport, uuid: () => string): DesktopClient {
  async function call(method: Request['method'], payload: Request['payload']): Promise<unknown> {
    const requestId = uuid()
    let raw: unknown
    try {
      raw = await transport.invoke({ version: 1, requestId, method, payload } as Request)
    } catch {
      throw new ContractError(failure('TRANSPORT_ERROR'))
    }
    return decodeResponse(method, requestId, raw)
  }
  return {
    async data<K extends DataOperation>(operation: K, args: DataArgs<K>): Promise<DataResult<K>> {
      const result = (await call('data.execute', { operation, args })) as {
        operation: DataOperation
        data: unknown
      }
      if (result.operation !== operation) throw new ContractError(failure('INVALID_RESPONSE'))
      return result.data as DataResult<K>
    },
    getEnvironment: () => call('app.environment', {}) as Promise<EnvironmentInfo>,
    openProject: () => call('project.open', {}) as Promise<Project | null>,
    onEnvironmentChecked(listener, onError) {
      let active = true
      let subscriptionId: string | undefined
      let sequence = 0
      const queued: EnvironmentEvent[] = []
      const report = (error: unknown): void => {
        if (active)
          onError(error instanceof ContractError ? error.info : failure('INVALID_RESPONSE'))
      }
      const deliver = (event: EnvironmentEvent): void => {
        if (!active || event.subscriptionId !== subscriptionId || event.sequence <= sequence) return
        sequence = event.sequence
        listener(event)
      }
      const removeListener = transport.listen((raw) => {
        if (!active) return
        const parsed = eventSchema.safeParse(raw)
        if (!parsed.success) {
          report(new ContractError(failure('INVALID_RESPONSE')))
          return
        }
        if (!subscriptionId) {
          if (queued.length < 32) queued.push(parsed.data)
          return
        }
        deliver(parsed.data)
      })
      const unsubscribe = (id: string): void => {
        void call('events.unsubscribe', { subscriptionId: id }).catch(report)
      }
      void call('events.subscribe', { type: 'environment.checked' })
        .then((result) => {
          subscriptionId = (result as { subscriptionId: string }).subscriptionId
          if (!active) {
            unsubscribe(subscriptionId)
            return
          }
          queued.splice(0).forEach(deliver)
        })
        .catch((error: unknown) => {
          removeListener()
          report(error)
          active = false
        })
      return () => {
        if (!active) return
        active = false
        removeListener()
        queued.length = 0
        if (subscriptionId) unsubscribe(subscriptionId)
      }
    },
  }
}
