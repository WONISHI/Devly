import { randomUUID } from 'node:crypto'
import {
  ContractError,
  failure,
  requestSchema,
  requestIdentitySchema,
  resultSchemas,
  type EnvironmentInfo,
  type EnvironmentEvent,
  type Project,
  type Response,
} from '../shared/contracts'

type Services = {
  environment(): Promise<EnvironmentInfo>
  openProject(isActive: () => boolean): Promise<Project | null>
  data?(payload: { operation: string; args: unknown }, isActive: () => boolean): Promise<unknown>
}
type Subscription = { owner: string; sequence: number; send: (event: EnvironmentEvent) => void }

// Owner identifies a particular document, not just a reusable BrowserWindow ID.
export class RequestRouter {
  private subscriptions = new Map<string, Subscription>()
  private inFlight = new Map<string, string>()
  constructor(private services: Services) {}

  clearOwner(owner: string): void {
    for (const [id, subscription] of this.subscriptions) {
      if (subscription.owner === owner) this.subscriptions.delete(id)
    }
  }

  async handle(
    raw: unknown,
    owner: string | null,
    isActive: () => boolean,
    send: Subscription['send'],
  ): Promise<Response> {
    const parsed = requestSchema.safeParse(raw)
    const identity = requestIdentitySchema.safeParse(raw)
    const requestId = identity.success ? identity.data.requestId : null
    const reject = (code: Parameters<typeof failure>[0]): Response => ({
      version: 1,
      requestId,
      ok: false,
      error: failure(code),
    })
    if (!owner || !isActive()) return reject('FORBIDDEN')
    if (!parsed.success) return reject('INVALID_REQUEST')
    const request = parsed.data
    if (this.inFlight.has(request.requestId)) return reject('INVALID_REQUEST')
    this.inFlight.set(request.requestId, owner)
    try {
      let data: unknown
      switch (request.method) {
        case 'app.environment':
          data = await this.services.environment()
          break
        case 'project.open':
          data = await this.services.openProject(isActive)
          break
        case 'data.execute':
          if (!this.services.data) return reject('STORAGE_UNAVAILABLE')
          data = await this.services.data(request.payload, isActive)
          break
        case 'events.subscribe': {
          if ([...this.subscriptions.values()].filter((item) => item.owner === owner).length >= 32)
            return reject('INVALID_REQUEST')
          const subscriptionId = randomUUID()
          this.subscriptions.set(subscriptionId, { owner, sequence: 0, send })
          data = { subscriptionId }
          break
        }
        case 'events.unsubscribe': {
          const subscription = this.subscriptions.get(request.payload.subscriptionId)
          if (subscription && subscription.owner !== owner) return reject('FORBIDDEN')
          data = { removed: this.subscriptions.delete(request.payload.subscriptionId) }
          break
        }
      }
      if (!isActive()) {
        this.clearOwner(owner)
        return reject('FORBIDDEN')
      }
      const validated = resultSchemas[request.method].safeParse(data)
      if (!validated.success) return reject('INTERNAL_ERROR')
      if (request.method === 'app.environment') {
        for (const [subscriptionId, subscription] of this.subscriptions) {
          if (subscription.owner !== owner) continue
          try {
            subscription.send({
              version: 1,
              subscriptionId,
              sequence: ++subscription.sequence,
              type: 'environment.checked',
              requestId: request.requestId,
              data: data as EnvironmentInfo,
            })
          } catch {
            this.subscriptions.delete(subscriptionId)
          }
        }
      }
      return { version: 1, requestId: request.requestId, ok: true, data: validated.data }
    } catch (error) {
      if (error instanceof ContractError)
        return { version: 1, requestId, ok: false, error: error.info }
      // Never serialize filesystem errors, stack traces or credentials to Renderer.
      return reject('INTERNAL_ERROR')
    } finally {
      this.inFlight.delete(request.requestId)
    }
  }
}
