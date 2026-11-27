import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../data/client'
import type { ChatRuntime } from '../chat/runtime'
import type { LocalSchedule } from '../../shared/schedule-contracts'
import type { ChatSnapshot } from '../../shared/chat-contracts'
import { TaskBudget } from '../extensions/budget'
import { ContractError, failure } from '../../shared/contracts'
export type ScheduleRun = {
  id: string
  scheduleId: string
  projectId: string
  state: string
  sessionId: string | null
  turnId: string | null
}
/** Local process only: no daemon, no catch-up burst, no writable/remote tools. */
export class ScheduleRuntime {
  private timer: ReturnType<typeof setInterval> | undefined
  private ticking: Promise<void> | undefined
  private active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  private closing = false
  private suspended = false
  private permitted = () => true
  setGuard(permitted: () => boolean) {
    this.permitted = permitted
  }
  constructor(
    private database: Pick<DatabaseClient, 'execute'>,
    private chats: ChatRuntime,
    private now: () => number = Date.now,
    private notify: (name: string, state: string) => void = () => {},
  ) {}
  async initialize(startTimer = true) {
    await this.database.execute('internal.schedules.recover', { now: this.now() })
    if (startTimer) {
      this.timer = setInterval(() => {
        void this.tick()
      }, 5000)
      this.timer.unref()
    }
  }
  setNotifier(notify: (name: string, state: string) => void) {
    this.notify = notify
  }
  suspend() {
    this.suspended = true
    for (const run of this.active.values()) run.controller.abort()
  }
  resume() {
    this.suspended = false
    void this.tick()
  }
  tick(): Promise<void> {
    if (this.ticking) return this.ticking
    if (this.closing || this.suspended) return Promise.resolve()
    const task = (async () => {
      const configs = await this.database.execute<LocalSchedule[]>('internal.schedules.all', {})
      for (const config of configs) {
        if (this.closing || this.suspended) break
        if (!config.enabled || config.nextAt > this.now() || this.active.size >= 4) continue
        try {
          await this.launch(config, false)
        } catch {
          /* Per-item failures cannot prevent other due tasks. Claim ledger carries execution failures. */
        }
      }
    })()
      .catch(() => {
        /* Storage unavailable: next bounded tick retries discovery, never replays a claimed run. */
      })
      .finally(() => {
        this.ticking = undefined
      })
    this.ticking = task
    return task
  }
  private async launch(config: LocalSchedule, force: boolean) {
    if (this.closing || this.suspended || !this.permitted() || this.active.has(config.id))
      throw new ContractError(failure('CHAT_BUSY'))
    const storage = await this.database.execute<{ pendingRestore: boolean }>('storage.status', {})
    if (storage.pendingRestore || !this.permitted())
      throw new ContractError(failure('BINDING_CHANGED'))
    const run = await this.database.execute<ScheduleRun | null>('internal.schedules.claim', {
      projectId: config.projectId,
      id: config.id,
      revision: config.revision,
      now: this.now(),
      force,
    })
    if (!run) throw new ContractError(failure('CHAT_BUSY'))
    if (run.state === 'skipped') return run
    const controller = new AbortController()
    const work = this.perform(config, run, controller)
    const done = work.finally(() => this.active.delete(config.id))
    this.active.set(config.id, { controller, done })
    void done.catch(() => {})
    return run
  }
  private async perform(config: LocalSchedule, run: ScheduleRun, controller: AbortController) {
    let sessionId: string | null = null,
      turnId: string | null = null,
      state = 'failed',
      reason: string | null = null
    const scope = { projectId: config.projectId, id: config.id, runId: run.id }
    try {
      turnId = randomUUID()
      const session = await this.database.execute<{ id: string }>('internal.schedules.session', {
        ...scope,
        revision: config.revision,
        turnId,
        now: this.now(),
      })
      sessionId = session.id
      controller.signal.throwIfAborted()
      const limits = {
          maxCalls: 6,
          maxRounds: 4,
          maxDurationMs: 30000,
          maxOutputChars: 16384,
          contextChars: 24000,
        },
        budget = new TaskBudget({ tokens: 2048, calls: 6, outputChars: 16384, durationMs: 30000 })
      await this.chats.execute(
        'chat.start',
        {
          projectId: config.projectId,
          sessionId,
          turnId,
          text: config.prompt,
          expectedProviderId: config.providerId,
          expectedModel: config.model,
          mode: 'read-only',
          selectedPaths: [],
        },
        () => !this.closing && !controller.signal.aborted && this.permitted(),
        `schedule:${run.id}`,
        { budget, limits, remoteDisabled: true, parentSignal: controller.signal },
      )
      await this.chats.waitForTurn(turnId)
      const result = await this.database.execute<ChatSnapshot>('chat.read', {
        projectId: config.projectId,
        sessionId,
      })
      state =
        result.turn?.state === 'completed'
          ? 'completed'
          : result.turn?.state === 'cancelled'
            ? 'cancelled'
            : 'failed'
      reason = state === 'completed' ? null : (result.turn?.error?.code ?? '未取得完成结果')
    } catch {
      state = controller.signal.aborted ? 'cancelled' : 'failed'
      reason =
        state === 'cancelled'
          ? '已请求停止并完成当前回合收尾'
          : '配置、项目、预算或网络不可用；未自动重试'
    } finally {
      if (controller.signal.aborted && sessionId)
        await this.chats.cancelScope(config.projectId, sessionId)
      await this.database.execute('internal.schedules.update', {
        ...scope,
        state,
        sessionId,
        turnId,
        endedAt: this.now(),
        reason,
      })
      if (config.notify && !this.closing) this.notify(config.name, state)
    }
  }
  async execute(operation: string, args: Record<string, unknown>) {
    if (operation === 'schedules.save') {
      if (args.id && this.active.has(String(args.id)))
        throw new ContractError({
          ...failure('CHAT_BUSY'),
          message: '任务执行中，请先停止再修改配置',
        })
      return this.database.execute(operation, args)
    }
    if (operation === 'schedules.stop' || operation === 'schedules.remove') {
      await this.database.execute('schedules.stop', args)
      const current = this.active.get(String(args.id))
      current?.controller.abort()
      await current?.done
      return operation === 'schedules.remove'
        ? this.database.execute(operation, args)
        : { removed: true }
    }
    if (operation === 'schedules.run') {
      const configs = await this.database.execute<LocalSchedule[]>('schedules.list', {
          projectId: args.projectId,
        }),
        config = configs.find((c) => c.id === args.id)
      if (!config || !config.enabled)
        throw new ContractError({
          ...failure('FORBIDDEN'),
          message: '请先明确启用此本地任务，再执行一次',
        })
      return this.launch(config, true)
    }
    return this.database.execute(operation, args)
  }
  async close() {
    this.closing = true
    if (this.timer) clearInterval(this.timer)
    await this.ticking
    for (const run of this.active.values()) run.controller.abort()
    await Promise.allSettled([...this.active.values()].map((r) => r.done))
  }
}
