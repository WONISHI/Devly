import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { scheduleInput, scheduleSchema, scheduleRunSchema } from '../../shared/schedule-contracts'
import { ContractError, failure } from '../../shared/contracts'
import { redactToolText } from '../agent/tools'
type Row = Record<string, unknown>
export class ScheduleRepository {
  constructor(
    private db: Database.Database,
    private project: (id: string) => unknown,
  ) {}
  private rows(sql: string, ...args: (string | number)[]) {
    return this.db.prepare(sql).all(...args) as Row[]
  }
  private one(sql: string, ...args: (string | number)[]) {
    return this.db.prepare(sql).get(...args) as Row | undefined
  }
  private get(projectId: string, id: string) {
    this.project(projectId)
    const row = this.one(
      'SELECT body FROM local_schedules WHERE id=? AND project_id=?',
      id,
      projectId,
    )
    if (!row) throw new ContractError(failure('NOT_FOUND'))
    return scheduleSchema.parse(JSON.parse(String(row.body)))
  }
  execute(operation: string, args: Record<string, unknown>): unknown {
    const projectId = String(args.projectId),
      id = String(args.id),
      now = Number(args.now ?? Date.now())
    if (operation === 'internal.schedules.recover') {
      this.db
        .prepare(
          "UPDATE schedule_runs SET state='interrupted',ended_at=?,reason='应用重启，未重放旧执行' WHERE state IN ('claimed','running')",
        )
        .run(now)
      return null
    }
    if (operation === 'internal.schedules.all')
      return this.rows('SELECT body FROM local_schedules ORDER BY id LIMIT 100').map((r) =>
        scheduleSchema.parse(JSON.parse(String(r.body))),
      )
    this.project(projectId)
    if (operation === 'schedules.list')
      return this.rows(
        'SELECT body FROM local_schedules WHERE project_id=? ORDER BY id LIMIT 10',
        projectId,
      ).map((r) => scheduleSchema.parse(JSON.parse(String(r.body))))
    if (operation === 'schedules.save') {
      const value = scheduleInput.parse(args)
      if (
        redactToolText(value.prompt) !== value.prompt ||
        redactToolText(value.name) !== value.name
      )
        throw new ContractError({
          ...failure('INVALID_REQUEST'),
          message: '任务名称或内容包含敏感凭据，请移除后再保存',
        })
      if (!this.one('SELECT id FROM providers WHERE id=?', value.providerId))
        throw new ContractError(failure('NOT_FOUND'))
      const old = value.id ? this.get(projectId, value.id) : null
      if (
        !old &&
        (this.rows('SELECT id FROM local_schedules').length >= 100 ||
          this.rows('SELECT id FROM local_schedules WHERE project_id=?', projectId).length >= 10)
      )
        throw new ContractError(failure('LIMIT_EXCEEDED'))
      const config = scheduleSchema.parse({
        ...value,
        id: old?.id ?? randomUUID(),
        revision: (old?.revision ?? 0) + 1,
        nextAt: now + value.intervalSeconds * 1000,
        updatedAt: now,
      })
      this.db
        .prepare(
          'INSERT INTO local_schedules(id,project_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
        )
        .run(config.id, projectId, JSON.stringify(config))
      return config
    }
    const config = this.get(projectId, id)
    if (operation === 'internal.schedules.session')
      return this.db.transaction(() => {
        const run = this.one(
          "SELECT id FROM schedule_runs WHERE id=? AND schedule_id=? AND state='claimed'",
          String(args.runId),
          id,
        )
        if (!run || !config.enabled || config.revision !== Number(args.revision))
          throw new ContractError(failure('BINDING_CHANGED'))
        const sessionId = randomUUID()
        this.db
          .prepare(
            'INSERT INTO sessions(id,project_id,title,updated_at,provider_id,model) VALUES(?,?,?,?,?,?)',
          )
          .run(sessionId, projectId, `定时：${config.name}`, now, config.providerId, config.model)
        this.db
          .prepare("UPDATE schedule_runs SET state='running',session_id=?,turn_id=? WHERE id=?")
          .run(sessionId, String(args.turnId), String(args.runId))
        return { id: sessionId }
      })()
    if (operation === 'schedules.history')
      return this.rows(
        'SELECT * FROM schedule_runs WHERE schedule_id=? AND project_id=? ORDER BY started_at DESC,id DESC LIMIT 30',
        id,
        projectId,
      ).map((r) => this.run(r))
    if (operation === 'schedules.stop') {
      this.db.prepare('UPDATE local_schedules SET body=? WHERE id=?').run(
        JSON.stringify({
          ...config,
          enabled: false,
          revision: config.revision + 1,
          updatedAt: now,
        }),
        id,
      )
      return { removed: true }
    }
    if (operation === 'schedules.remove') {
      if (
        this.one(
          "SELECT id FROM schedule_runs WHERE schedule_id=? AND state IN ('claimed','running')",
          id,
        )
      )
        throw new ContractError(failure('CHAT_BUSY'))
      this.db.prepare('DELETE FROM local_schedules WHERE id=?').run(id)
      return { removed: true }
    }
    if (operation === 'internal.schedules.claim')
      return this.db.transaction(() => {
        if (
          !config.enabled ||
          config.revision !== Number(args.revision) ||
          (!args.force && config.nextAt > now)
        )
          return null
        if (
          this.one(
            "SELECT id FROM schedule_runs WHERE schedule_id=? AND state IN ('claimed','running')",
            id,
          )
        )
          return null
        const due = config.nextAt,
          missed = now - due > Math.min(config.intervalSeconds * 1000, 30000),
          today = Math.floor(now / 86400000) * 86400000
        const daily = Number(
          this.one(
            'SELECT count FROM schedule_daily_counts WHERE schedule_id=? AND day=?',
            id,
            today,
          )?.count ?? 0,
        )
        const reason =
          daily >= config.maxRunsPerDay
            ? '当日运行次数上限'
            : !args.force && missed && config.misfire === 'skip'
              ? '错过执行已跳过'
              : null
        this.db
          .prepare(
            "DELETE FROM schedule_runs WHERE schedule_id=? AND state NOT IN ('claimed','running') AND id NOT IN (SELECT id FROM schedule_runs WHERE schedule_id=? AND state NOT IN ('claimed','running') ORDER BY started_at DESC,id DESC LIMIT 299)",
          )
          .run(id, id)
        if (!reason)
          this.db
            .prepare(
              'INSERT INTO schedule_daily_counts(schedule_id,day,count) VALUES(?,?,1) ON CONFLICT(schedule_id,day) DO UPDATE SET count=count+1',
            )
            .run(id, today)
        this.db
          .prepare('DELETE FROM schedule_daily_counts WHERE schedule_id=? AND day<?')
          .run(id, today - 31 * 86400000)
        const runId = randomUUID()
        this.db
          .prepare('UPDATE local_schedules SET body=? WHERE id=?')
          .run(JSON.stringify({ ...config, nextAt: now + config.intervalSeconds * 1000 }), id)
        this.db
          .prepare(
            'INSERT INTO schedule_runs(id,schedule_id,project_id,due_at,started_at,ended_at,state,reason) VALUES(?,?,?,?,?,?,?,?)',
          )
          .run(
            runId,
            id,
            projectId,
            due,
            now,
            reason ? now : null,
            reason ? 'skipped' : 'claimed',
            reason,
          )
        return this.run(this.one('SELECT * FROM schedule_runs WHERE id=?', runId)!)
      })()
    if (operation === 'internal.schedules.update') {
      const run = this.one(
        'SELECT * FROM schedule_runs WHERE id=? AND schedule_id=? AND project_id=?',
        String(args.runId),
        id,
        projectId,
      )
      if (!run || !['claimed', 'running'].includes(String(run.state)))
        throw new ContractError(failure('CHAT_BUSY'))
      const next = scheduleRunSchema.parse({
        ...this.run(run),
        state: args.state,
        sessionId: args.sessionId ?? run.session_id,
        turnId: args.turnId ?? run.turn_id,
        endedAt: args.endedAt ?? null,
        reason: args.reason ?? null,
      })
      this.db
        .prepare(
          'UPDATE schedule_runs SET state=?,session_id=?,turn_id=?,ended_at=?,reason=? WHERE id=?',
        )
        .run(next.state, next.sessionId, next.turnId, next.endedAt, next.reason, next.id)
      return next
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
  private run(row: Row) {
    return scheduleRunSchema.parse({
      id: row.id,
      scheduleId: row.schedule_id,
      projectId: row.project_id,
      dueAt: row.due_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      state: row.state,
      sessionId: row.session_id,
      turnId: row.turn_id,
      reason: row.reason,
    })
  }
}
