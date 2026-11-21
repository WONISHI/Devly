import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { RequestRouter } from '../src/main/request-router'
import { createDesktopClient, type Transport } from '../src/preload/desktop-client'
import {
  decodeResponse,
  type EnvironmentEvent,
  type Request,
  type Response,
} from '../src/shared/contracts'

const environment = {
  appVersion: '0.1',
  electron: '39',
  node: '22',
  platform: 'darwin',
  git: null,
  codex: null,
}
const request = (method: Request['method'], payload: Request['payload'] = {}): Request =>
  ({ version: 1, requestId: randomUUID(), method, payload }) as Request
function setup() {
  const services = {
    environment: vi.fn(async () => environment),
    openProject: vi.fn(async () => null),
  }
  const router = new RequestRouter(services)
  const send = vi.fn()
  const invoke = (raw: unknown, owner: string | null = 'document-A') =>
    router.handle(raw, owner, () => true, send)
  return { services, router, send, invoke }
}
async function subscribe(invoke: (request: Request) => Promise<Response>): Promise<string> {
  const result = await invoke(request('events.subscribe', { type: 'environment.checked' }))
  if (!result.ok) throw Error(result.error.code)
  return (result.data as { subscriptionId: string }).subscriptionId
}
describe('Main request boundary', () => {
  it.each([
    null,
    {},
    { ...request('project.open'), payload: { path: '/secret' } },
    { ...request('project.open'), version: 2 },
    { ...request('project.open'), requestId: 'bad' },
    { ...request('project.open'), method: 'shell.exec' },
  ])('rejects malformed envelopes before service execution: %j', async (raw) => {
    const { invoke, services } = setup()
    expect(await invoke(raw)).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(services.openProject).not.toHaveBeenCalled()
  })
  it('rejects untrusted senders before executing a valid request', async () => {
    const { invoke, services } = setup()
    expect(await invoke(request('project.open'), null)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(services.openProject).not.toHaveBeenCalled()
  })
  it('does not expose internal exceptions or secrets', async () => {
    const { invoke, services } = setup()
    services.openProject.mockRejectedValueOnce(new Error('private/path API_KEY=secret'))
    const response = await invoke(request('project.open'))
    expect(response).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', retryable: true },
    })
    expect(JSON.stringify(response)).not.toContain('secret')
  })
  it('rejects malformed service results', async () => {
    const { invoke, services } = setup()
    services.environment.mockResolvedValueOnce({ ...environment, node: 42 } as never)
    expect(await invoke(request('app.environment'))).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    })
  })
  it('blocks duplicate in-flight IDs, then allows later requests', async () => {
    const { invoke, services } = setup()
    let resolve!: (value: typeof environment) => void
    services.environment.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const raw = request('app.environment')
    const pending = invoke(raw)
    expect(await invoke(raw, 'document-B')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    })
    resolve(environment)
    expect(await pending).toMatchObject({ ok: true, requestId: raw.requestId })
    expect(await invoke(request('app.environment'))).toMatchObject({ ok: true })
  })
  it('discards an async result after its document is replaced', async () => {
    const { services, router, send } = setup()
    let active = true
    services.environment.mockImplementationOnce(async () => {
      active = false
      return environment
    })
    expect(
      await router.handle(request('app.environment'), 'old-document', () => active, send),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(send).not.toHaveBeenCalled()
  })
  it('routes events only to their owner and enforces unsubscribe ownership/idempotence', async () => {
    const { invoke, send } = setup()
    const subscriptionId = await subscribe(invoke)
    await invoke(request('app.environment'), 'document-B')
    expect(send).not.toHaveBeenCalled()
    expect(
      await invoke(request('events.unsubscribe', { subscriptionId }), 'document-B'),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    const raw = request('app.environment')
    await invoke(raw)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId,
        requestId: raw.requestId,
        sequence: 1,
        data: environment,
      }),
    )
    expect(await invoke(request('events.unsubscribe', { subscriptionId }))).toMatchObject({
      ok: true,
      data: { removed: true },
    })
    expect(await invoke(request('events.unsubscribe', { subscriptionId }))).toMatchObject({
      ok: true,
      data: { removed: false },
    })
    await invoke(request('app.environment'))
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('clears all subscriptions when a document is destroyed or navigated', async () => {
    const { invoke, router, send } = setup()
    await subscribe(invoke)
    await subscribe(invoke)
    router.clearOwner('document-A')
    await invoke(request('app.environment'))
    expect(send).not.toHaveBeenCalled()
  })
  it('limits subscriptions per document', async () => {
    const { invoke } = setup()
    for (let index = 0; index < 32; index++) await subscribe(invoke)
    expect(
      await invoke(request('events.subscribe', { type: 'environment.checked' })),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  })
})
describe('Preload client', () => {
  it('rejects another request result and incorrect result shapes', () => {
    const id = randomUUID()
    expect(() =>
      decodeResponse('app.environment', id, {
        version: 1,
        requestId: randomUUID(),
        ok: true,
        data: environment,
      }),
    ).toThrow('桌面响应不符合契约')
    expect(() =>
      decodeResponse('app.environment', id, { version: 1, requestId: id, ok: true, data: null }),
    ).toThrow('桌面响应不符合契约')
  })
  it('matches out-of-order concurrent responses to their own promises', async () => {
    const pending: { request: Request; resolve: (value: unknown) => void }[] = []
    const client = createDesktopClient(
      {
        invoke: (raw) => new Promise((resolve) => pending.push({ request: raw, resolve })),
        listen: () => () => {},
      },
      randomUUID,
    )
    const first = client.getEnvironment()
    const second = client.openProject()
    pending[1].resolve({
      version: 1,
      requestId: pending[1].request.requestId,
      ok: true,
      data: null,
    })
    expect(await second).toBeNull()
    pending[0].resolve({
      version: 1,
      requestId: pending[0].request.requestId,
      ok: true,
      data: environment,
    })
    expect(await first).toEqual(environment)
  })
  it('maps transport exceptions to a safe error', async () => {
    const client = createDesktopClient(
      {
        invoke: async () => {
          throw Error('secret')
        },
        listen: () => () => {},
      },
      randomUUID,
    )
    await expect(client.getEnvironment()).rejects.toMatchObject({
      info: { code: 'TRANSPORT_ERROR' },
    })
  })
  function clientSetup(defer = false) {
    const subscriptionId = randomUUID()
    let receive: ((raw: unknown) => void) | undefined
    let finish!: () => void
    const remove = vi.fn(() => {
      receive = undefined
    })
    const invoke = vi.fn<Transport['invoke']>(async (raw) => {
      if (raw.method === 'events.subscribe' && defer)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      return {
        version: 1,
        requestId: raw.requestId,
        ok: true,
        data: raw.method === 'events.subscribe' ? { subscriptionId } : { removed: true },
      }
    })
    const client = createDesktopClient(
      {
        invoke,
        listen: (listener) => {
          receive = listener
          return remove
        },
      },
      randomUUID,
    )
    const emit = (sequence = 1, id = subscriptionId) =>
      receive?.({
        version: 1,
        subscriptionId: id,
        sequence,
        type: 'environment.checked',
        requestId: randomUUID(),
        data: environment,
      } satisfies EnvironmentEvent)
    return { client, invoke, remove, emit, finish: () => finish() }
  }
  it('filters subscription IDs and repeated sequence numbers; cleanup is immediate and idempotent', async () => {
    const { client, emit, invoke, remove } = clientSetup()
    const listener = vi.fn()
    const onError = vi.fn()
    const stop = client.onEnvironmentChecked(listener, onError)
    await vi.waitFor(() => expect(invoke).toHaveResolved())
    emit(1, randomUUID())
    emit(1)
    emit(1)
    emit(2)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    stop()
    emit(3)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls.filter(([raw]) => raw.method === 'events.unsubscribe')).toHaveLength(1)
    expect(onError).not.toHaveBeenCalled()
  })
  it('unsubscribes the server even if cleanup occurs before subscribe resolves', async () => {
    const { client, invoke, remove, finish } = clientSetup(true)
    const stop = client.onEnvironmentChecked(vi.fn(), vi.fn())
    stop()
    finish()
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
    expect(invoke.mock.calls[1][0].method).toBe('events.unsubscribe')
    expect(remove).toHaveBeenCalledTimes(1)
  })
  it('delivers early events once subscribe is acknowledged', async () => {
    const { client, emit, finish } = clientSetup(true)
    const listener = vi.fn()
    const stop = client.onEnvironmentChecked(listener, vi.fn())
    emit()
    expect(listener).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    stop()
  })
  it('reports subscription failure and removes its listener', async () => {
    const remove = vi.fn()
    const onError = vi.fn()
    const client = createDesktopClient(
      {
        invoke: async () => {
          throw Error('secret')
        },
        listen: () => remove,
      },
      randomUUID,
    )
    const stop = client.onEnvironmentChecked(vi.fn(), onError)
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TRANSPORT_ERROR' })),
    )
    stop()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
