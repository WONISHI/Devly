import { randomUUID, createHash } from 'node:crypto'
import { z } from 'zod'
import type { BrowserWindow, Session } from 'electron'
import { browserAction, type BrowserAction } from '../../shared/browser-contracts'
import type { WebConfig } from '../../shared/web-contracts'
import type { AgentTool } from '../../shared/agent-contracts'
import type { DatabaseClient } from '../data/client'
import type { ApprovalBroker, ApprovalScope } from '../agent/approval-broker'
import { ToolFailure, redactToolText } from '../agent/tools'
import { BrowserProxy } from './proxy'
import { browserDOM } from './dom'
type Live = {
  window: BrowserWindow
  session: Session
  proxy: BrowserProxy
  projectId: string
  revision: number
  previewOrigin: string | null
  origins: Set<string>
}
export const browserTool = {
  name: 'browser_action',
  description:
    'Propose one isolated browser action. Every navigation, DOM read, screenshot, click, fill or close needs fresh exact approval. Use open_preview for the user-started project preview or open_url for an explicitly configured HTTPS origin. Never enter secrets. Screenshots are actual artifacts for user review, not proof the model saw an image. No arbitrary scripts, uploads, password fields, popups or downloads.',
  parameters: z.toJSONSchema(browserAction) as Record<string, unknown>,
}
export class BrowserRuntime {
  private live = new Map<string, Live>()
  private closing = new Map<string, Promise<void>>()
  private preview: (projectId: string) => string | null = () => null
  constructor(private database: Pick<DatabaseClient, 'execute'>) {}
  setPreviewResolver(resolve: (projectId: string) => string | null) {
    this.preview = resolve
  }
  private config(projectId: string) {
    return this.database.execute<WebConfig>('internal.web.config', { projectId })
  }
  async tools(projectId: string) {
    return (await this.config(projectId)).browserEnabled ? [browserTool] : []
  }
  async clearProject(projectId: string) {
    await Promise.all(
      [...this.live]
        .filter(([, live]) => live.projectId === projectId)
        .map(([id]) => this.release(id)),
    )
  }
  async close() {
    await Promise.all([...this.live.keys()].map((id) => this.release(id)))
  }
  release(id: string): Promise<void> {
    const pending = this.closing.get(id)
    if (pending) return pending
    const live = this.live.get(id)
    if (!live) return Promise.resolve()
    this.live.delete(id)
    const task = (async () => {
      if (!live.window.isDestroyed()) live.window.destroy()
      await live.proxy.close()
      await live.session.closeAllConnections()
      await live.session.clearStorageData()
    })().finally(() => this.closing.delete(id))
    this.closing.set(id, task)
    return task
  }
  private async create(
    scope: ApprovalScope,
    projectId: string,
    config: WebConfig,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted()
    if (this.live.size >= 4) throw new ToolFailure('BROWSER_LIMIT')
    const { BrowserWindow, session } = await import('electron')
    signal.throwIfAborted()
    const previewURL = this.preview(scope.projectId),
      previewOrigin = previewURL ? new URL(previewURL).origin : null,
      origins = new Set(config.browserOrigins)
    const proxy = await new BrowserProxy(origins, previewOrigin).start()
    const isolated = session.fromPartition(`devly-browser-${randomUUID()}`, { cache: false })
    let window: BrowserWindow | undefined
    try {
      await isolated.setProxy({
        mode: 'fixed_servers',
        proxyRules: `http=127.0.0.1:${proxy.port};https=127.0.0.1:${proxy.port}`,
        proxyBypassRules: '<-loopback>',
      })
      signal.throwIfAborted()
      isolated.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
      isolated.setPermissionCheckHandler(() => false)
      isolated.setDevicePermissionHandler(() => false)
      isolated.setDisplayMediaRequestHandler((_r, cb) => cb({}))
      isolated.allowNTLMCredentialsForDomains('')
      isolated.on('will-download', (event) => event.preventDefault())
      const allowed = (raw: string) => {
        try {
          const u = new URL(raw)
          return (
            !u.username &&
            !u.password &&
            ((origins.has(u.origin) && u.protocol === 'https:') ||
              (u.origin === previewOrigin && u.protocol === 'http:'))
          )
        } catch {
          return false
        }
      }
      isolated.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !allowed(details.url) }))
      window = new BrowserWindow({
        title: 'Devly · 已审批浏览器',
        width: 1000,
        height: 760,
        show: false,
        webPreferences: {
          session: isolated,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          nodeIntegrationInSubFrames: false,
          webviewTag: false,
          devTools: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          safeDialogs: true,
        },
      })
      const wc = window.webContents
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
      wc.setWindowOpenHandler(() => ({ action: 'deny' }))
      wc.on('will-attach-webview', (event) => event.preventDefault())
      wc.on('will-navigate', (event, url) => {
        if (!allowed(url)) event.preventDefault()
      })
      wc.on('login', (event, _details, info, cb) => {
        event.preventDefault()
        if (info.isProxy && info.host === '127.0.0.1' && info.port === proxy.port)
          cb('devly', proxy.password)
        else cb()
      })
      wc.debugger.attach('1.3')
      wc.debugger.on('message', (_event, method, params) => {
        if (method === 'Page.fileChooserOpened' && params.backendNodeId)
          void wc.debugger
            .sendCommand('DOM.setFileInputFiles', {
              files: [],
              backendNodeId: params.backendNodeId,
            })
            .catch(() => {})
      })
      const live: Live = {
        window,
        session: isolated,
        proxy,
        projectId,
        revision: config.revision,
        previewOrigin,
        origins,
      }
      this.live.set(scope.turnId, live)
      window.once('closed', () => {
        void this.release(scope.turnId)
      })
      if (signal.aborted) {
        await this.release(scope.turnId)
        signal.throwIfAborted()
      }
      return live
    } catch (error) {
      if (window && !window.isDestroyed()) window.destroy()
      await proxy.close()
      await isolated.closeAllConnections()
      await isolated.clearStorageData()
      throw error
    }
  }
  private async dom(
    live: Live,
    action: string,
    selector = '',
    value = '',
    expected = '',
  ): Promise<Record<string, unknown>> {
    const code = `(${browserDOM.toString()})(${[action, selector, value, expected].map((x) => JSON.stringify(x)).join(',')})`
    const result = await live.window.webContents.executeJavaScriptInIsolatedWorld(
      999,
      [{ code }],
      true,
    )
    if (result.error) throw new ToolFailure(String(result.error))
    return result
  }
  async execute(
    projectId: string,
    input: string,
    record: AgentTool,
    save: (tool: AgentTool) => Promise<unknown>,
    broker: ApprovalBroker,
    scope: ApprovalScope,
    signal: AbortSignal,
    secret = '',
  ) {
    let args: BrowserAction
    try {
      args = browserAction.parse(JSON.parse(input))
    } catch {
      throw new ToolFailure('INVALID_ARGUMENTS')
    }
    if (redactToolText(input, secret) !== input) throw new ToolFailure('SENSITIVE_CONTENT')
    const config = await this.config(projectId)
    if (!config.browserEnabled) throw new ToolFailure('BROWSER_DISABLED')
    let live = this.live.get(scope.turnId)
    if (live && live.revision !== config.revision) {
      await this.release(scope.turnId)
      throw new ToolFailure('PERMISSION_DENIED')
    }
    const page = live && !live.window.isDestroyed() ? live.window.webContents.getURL() : null
    const previewURL = this.preview(scope.projectId)
    if (args.action === 'open_url') {
      const url = new URL(args.url)
      if (
        url.username ||
        url.password ||
        url.hash ||
        url.protocol !== 'https:' ||
        !config.browserOrigins.includes(url.origin)
      )
        throw new ToolFailure('BROWSER_ORIGIN_DENIED')
    } else if (args.action === 'open_preview') {
      if (!previewURL) throw new ToolFailure('PREVIEW_NOT_RUNNING')
    } else if (!live || !page) throw new ToolFailure('BROWSER_NOT_OPEN')
    const snapshot =
      'selector' in args ? String((await this.dom(live!, 'snapshot', args.selector)).snapshot) : ''
    const displayPage =
      page && live?.previewOrigin === new URL(page).origin
        ? new URL(page).origin +
          new URL(page).pathname.replace(/\/entry\/[^/]+/, '/entry/[private]')
        : page
    record.input = redactToolText(
      JSON.stringify({ ...args, page: displayPage, policyRevision: config.revision }),
      secret,
    )
    const { request, decision } = broker.request(
      scope,
      'browser_action',
      {
        args,
        page,
        revision: config.revision,
        snapshot: createHash('sha256').update(snapshot).digest('hex'),
      },
      signal,
    )
    record.state = 'waiting_approval'
    record.approval = {
      id: request.id,
      digest: request.digest,
      expiresAt: request.expiresAt,
      state: 'pending',
    }
    const persist = async () => {
      await save(record)
      await this.database.execute('internal.chat.approval', {
        ...scope,
        toolId: record.id,
        approval: record.approval,
      })
    }
    try {
      await persist()
      await this.database.execute('internal.chat.update', { ...scope, phase: 'waiting_approval' })
      const allowed = await decision
      record.approval.state = signal.aborted
        ? 'cancelled'
        : Date.now() >= request.expiresAt
          ? 'expired'
          : allowed
            ? 'approved'
            : 'denied'
      await persist()
      signal.throwIfAborted()
      await this.database.execute('internal.chat.update', { ...scope, phase: 'running' })
      if (!allowed) throw new ToolFailure('APPROVAL_DENIED')
      if (
        Date.now() >= request.expiresAt ||
        (await this.config(projectId)).revision !== config.revision
      )
        throw new ToolFailure('PERMISSION_DENIED')
      if (live && (live.window.isDestroyed() || live.window.webContents.getURL() !== page))
        throw new ToolFailure('TARGET_CHANGED')
      record.state = 'running'
      await save(record)
      const active = AbortSignal.any([signal, AbortSignal.timeout(20000)])
      const abort = () => {
        void this.release(scope.turnId)
      }
      active.addEventListener('abort', abort, { once: true })
      try {
        active.throwIfAborted()
        if (args.action === 'close') {
          await this.release(scope.turnId)
          return { closed: true }
        }
        live ??= await this.create(scope, projectId, config, active)
        if (args.action === 'open_url' || args.action === 'open_preview')
          await live.window.loadURL(args.action === 'open_url' ? args.url : previewURL!)
        if (args.action === 'open_url' || args.action === 'open_preview') {
          await live.window.webContents.debugger.sendCommand('Page.enable', {
            enableFileChooserOpenedEvent: true,
          })
          await live.window.webContents.debugger.sendCommand('Page.setInterceptFileChooserDialog', {
            enabled: true,
          })
          live.window.show()
        }
        let result: Record<string, unknown>
        if (args.action === 'screenshot') {
          const image = (await live.window.webContents.capturePage())
            .resize({ width: 1000 })
            .toPNG()
          active.throwIfAborted()
          result = {
            image: await this.database.execute('internal.attachments.capture', {
              ...scope,
              toolId: record.id,
              bytes: image,
            }),
            note: '实际截图供用户查看；未自动发给模型视觉接口',
          }
        } else
          result = await this.dom(
            live,
            ['click', 'fill'].includes(args.action) ? args.action : 'read_text',
            'selector' in args ? args.selector : '',
            'value' in args ? args.value : '',
            snapshot,
          )
        active.throwIfAborted()
        return { ...result, url: live.window.webContents.getURL(), retrievedAt: Date.now() }
      } catch (error) {
        if (active.aborted)
          throw new ToolFailure(
            ['open_url', 'open_preview', 'click', 'fill'].includes(args.action)
              ? 'EXECUTION_STATE_UNKNOWN'
              : 'CANCELLED',
          )
        if (error instanceof ToolFailure) throw error
        throw new ToolFailure('BROWSER_ACTION_FAILED')
      } finally {
        active.removeEventListener('abort', abort)
      }
    } finally {
      broker.revoke(request.id)
    }
  }
}
