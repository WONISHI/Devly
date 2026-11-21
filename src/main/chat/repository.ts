import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ContractError, failure } from '../../shared/contracts'
import {
  chatTurnSchema,
  canTransition,
  taskPhaseSchema,
  type ChatTurn,
} from '../../shared/chat-contracts'
import type { Message } from '../../shared/provider-contracts'

type Row = Record<string, unknown>
type Scope = { projectId: string; sessionId: string }
export class ChatRepository {
  constructor(
    private db: Database.Database,
    private requireSession: (projectId: string, sessionId: string) => Row,
  ) {}
  private one(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).get(...args) as Row | undefined
  }
  private run(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).run(...args)
  }
  private active(sessionId: string) {
    return this.one(
      "SELECT id FROM turns WHERE session_id=? AND status IN ('pending','running')",
      sessionId,
    )
  }
  private turn(row: Row): ChatTurn {
    return chatTurnSchema.parse({
      id: row.id,
      projectId: row.project_id,
      sessionId: row.session_id,
      providerId: row.provider_id,
      model: row.model,
      state: row.status,
      phase: row.phase,
      userMessageId: row.user_message_id,
      assistantMessageId: row.assistant_message_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      error: row.error ? JSON.parse(String(row.error)) : null,
      usage: row.usage ? JSON.parse(String(row.usage)) : null,
      finish: row.finish,
    })
  }
  bind(args: Scope & { providerId: string; model: string; allowHistory: boolean }): void {
    this.requireSession(args.projectId, args.sessionId)
    if (this.active(args.sessionId)) throw new ContractError(failure('CHAT_BUSY'))
    const current = this.one('SELECT provider_id,model FROM sessions WHERE id=?', args.sessionId)!
    if (
      !args.allowHistory &&
      (current.provider_id !== args.providerId || current.model !== args.model) &&
      this.one('SELECT id FROM messages WHERE session_id=? LIMIT 1', args.sessionId)
    )
      throw new ContractError(failure('HISTORY_CONFIRMATION_REQUIRED'))
    const provider = this.one(
      "SELECT id FROM providers WHERE id=? AND protocol='chat-completions'",
      args.providerId,
    )
    if (!provider) throw new ContractError(failure('NOT_FOUND'))
    this.run(
      'UPDATE sessions SET provider_id=?,model=?,updated_at=? WHERE id=?',
      args.providerId,
      args.model,
      Date.now(),
      args.sessionId,
    )
  }
  execute(operation: string, raw: unknown): unknown {
    const args = raw as Scope & Record<string, unknown>
    if (operation === 'internal.chat.recover') {
      return this.run(
        "UPDATE turns SET status='failed',phase='failed',ended_at=?,error=? WHERE status IN ('pending','running')",
        Date.now(),
        JSON.stringify({
          code: 'INTERRUPTED',
          message: '上次生成已中断；保留已保存内容，请手动重新发送',
          status: null,
          retryAfterSeconds: null,
        }),
      ).changes
    }
    const session = this.requireSession(args.projectId, args.sessionId)
    if (operation === 'internal.chat.context') {
      const rows = this.db
        .prepare(
          `SELECT m.role,p.text FROM messages m JOIN turns t ON t.id=m.turn_id JOIN message_parts p ON p.message_id=m.id WHERE m.session_id=? AND t.status='completed' AND p.type='text' AND m.role IN ('user','assistant') ORDER BY m.created_at,m.id LIMIT 201`,
        )
        .all(args.sessionId) as Row[]
      if (rows.length > 200) throw new ContractError(failure('CONTEXT_LIMIT'))
      const messages = rows.map((row) => ({ role: row.role, content: row.text })) as Message[]
      if (Buffer.byteLength(JSON.stringify(messages)) > 262144)
        throw new ContractError(failure('CONTEXT_LIMIT'))
      return messages
    }
    if (operation === 'internal.chat.begin') {
      return this.db.transaction(() => {
        if (session.archived) throw new ContractError(failure('FORBIDDEN'))
        if (this.active(args.sessionId)) throw new ContractError(failure('CHAT_BUSY'))
        if (session.provider_id !== args.providerId || session.model !== args.model)
          throw new ContractError(failure('BINDING_CHANGED'))
        const config = this.one(
          'SELECT revision FROM providers WHERE id=?',
          String(args.providerId),
        )
        if (!config || config.revision !== args.revision)
          throw new ContractError(failure('BINDING_CHANGED'))
        if (this.one('SELECT id FROM turns WHERE id=?', String(args.turnId)))
          throw new ContractError(failure('INVALID_REQUEST'))
        const last = this.one(
          'SELECT MAX(created_at) AS time FROM messages WHERE session_id=?',
          args.sessionId,
        )
        const now = Math.max(Date.now(), Number(last?.time ?? 0) + 1)
        const userId = randomUUID(),
          assistantId = randomUUID()
        this.run(
          "INSERT INTO turns(id,session_id,project_id,status,phase,provider_id,model,provider_revision,user_message_id,assistant_message_id,started_at) VALUES(?,?,?,'running','running',?,?,?,?,?,?)",
          String(args.turnId),
          args.sessionId,
          args.projectId,
          String(args.providerId),
          String(args.model),
          Number(args.revision),
          userId,
          assistantId,
          now,
        )
        for (const [id, role, text, time] of [
          [userId, 'user', String(args.text), now],
          [assistantId, 'assistant', '', now + 1],
        ] as const) {
          this.run(
            'INSERT INTO messages(id,session_id,turn_id,role,created_at) VALUES(?,?,?,?,?)',
            id,
            args.sessionId,
            String(args.turnId),
            role,
            time,
          )
          this.run(
            "INSERT INTO message_parts(id,message_id,session_id,position,type,text) VALUES(?,?,?,0,'text',?)",
            randomUUID(),
            id,
            args.sessionId,
            text,
          )
        }
        if (
          !this.one(
            'SELECT id FROM messages WHERE session_id=? AND id NOT IN (?,?) LIMIT 1',
            args.sessionId,
            userId,
            assistantId,
          ) &&
          session.title === '新任务'
        )
          this.run(
            'UPDATE sessions SET title=? WHERE id=?',
            String(args.text).replace(/\s+/g, ' ').slice(0, 40),
            args.sessionId,
          )
        this.run('UPDATE sessions SET updated_at=? WHERE id=?', now + 1, args.sessionId)
        return this.turn(this.one('SELECT * FROM turns WHERE id=?', String(args.turnId))!)
      })()
    }
    if (operation === 'internal.chat.update') {
      const turn = this.one(
        'SELECT * FROM turns WHERE id=? AND session_id=?',
        String(args.turnId),
        args.sessionId,
      )
      if (!turn) throw new ContractError(failure('NOT_FOUND'))
      if (turn.status !== 'running' && turn.status !== 'pending') return { updated: false }
      if (
        !canTransition(
          taskPhaseSchema.parse(turn.phase),
          taskPhaseSchema.parse(args.phase ?? turn.phase),
        )
      )
        throw new ContractError(failure('INVALID_REQUEST'))
      this.db.transaction(() => {
        if (args.text !== undefined) {
          if (typeof args.text !== 'string' || args.text.length > 262144)
            throw new ContractError(failure('LIMIT_EXCEEDED'))
          this.run(
            'UPDATE message_parts SET text=? WHERE message_id=? AND type=?',
            args.text,
            String(turn.assistant_message_id),
            'text',
          )
        }
        this.run(
          'UPDATE turns SET status=?,phase=?,ended_at=?,error=?,usage=?,finish=? WHERE id=?',
          String(args.state ?? turn.status),
          String(args.phase ?? turn.phase),
          args.endedAt == null ? null : Number(args.endedAt),
          args.error ? JSON.stringify(args.error) : null,
          args.usage ? JSON.stringify(args.usage) : null,
          args.finish == null ? null : String(args.finish),
          String(args.turnId),
        )
        this.run('UPDATE sessions SET updated_at=? WHERE id=?', Date.now(), args.sessionId)
      })()
      return { updated: true }
    }
    if (operation === 'chat.read') {
      const row = this.one(
        'SELECT * FROM turns WHERE session_id=? ORDER BY started_at DESC,id DESC LIMIT 1',
        args.sessionId,
      )
      const part = row?.assistant_message_id
        ? this.one(
            "SELECT text FROM message_parts WHERE message_id=? AND type='text'",
            String(row.assistant_message_id),
          )
        : undefined
      return { turn: row ? this.turn(row) : null, text: String(part?.text ?? '') }
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
}
