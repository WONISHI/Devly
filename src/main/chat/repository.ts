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
import { agentInfoSchema, agentToolSchema } from '../../shared/agent-contracts'

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
      agent: row.agent_info ? JSON.parse(String(row.agent_info)) : undefined,
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
      this.db
        .prepare(
          "UPDATE tool_calls SET state='failed',payload=json_set(payload,'$.state','failed','$.error','INTERRUPTED') WHERE state IN ('proposed','waiting_approval','queued','running') AND payload != '{}'",
        )
        .run()
      this.db
        .prepare(
          "UPDATE approvals SET state='denied',payload=json_set(payload,'$.state','expired') WHERE state='pending'",
        )
        .run()
      this.db
        .prepare(
          "UPDATE tool_calls SET payload=json_set(payload,'$.approval.state','expired') WHERE json_extract(payload,'$.approval.state')='pending'",
        )
        .run()
      return this.run(
        "UPDATE turns SET status='failed',phase='failed',ended_at=?,error=? WHERE status IN ('pending','running')",
        Date.now(),
        JSON.stringify({
          code: 'INTERRUPTED',
          message: '上次运行已中断；已有内容或修改可能保留，请核对后另发任务；不会自动续跑。',
          status: null,
          retryAfterSeconds: null,
        }),
      ).changes
    }
    const session = this.requireSession(args.projectId, args.sessionId)
    if (operation === 'internal.chat.approval') {
      const tool = this.one(
        `SELECT t.id FROM tool_calls t JOIN turns r ON r.id=t.turn_id WHERE t.id=? AND t.turn_id=? AND t.session_id=? AND r.status='running'`,
        String(args.toolId),
        String(args.turnId),
        args.sessionId,
      )
      if (!tool) throw new ContractError(failure('FORBIDDEN'))
      const approval = agentToolSchema.shape.approval.parse(args.approval)
      if (!approval) throw new ContractError(failure('INVALID_REQUEST'))
      const old = this.one('SELECT tool_call_id,payload FROM approvals WHERE id=?', approval.id)
      if (
        old &&
        (old.tool_call_id !== args.toolId ||
          JSON.parse(String(old.payload)).digest !== approval.digest)
      )
        throw new ContractError(failure('FORBIDDEN'))
      this.run(
        'INSERT INTO approvals(id,tool_call_id,session_id,state,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload',
        approval.id,
        String(args.toolId),
        args.sessionId,
        approval.state === 'approved'
          ? 'approved'
          : approval.state === 'pending'
            ? 'pending'
            : 'denied',
        JSON.stringify(approval),
      )
      return { updated: true }
    }
    if (operation === 'internal.chat.tool' || operation === 'internal.chat.agent') {
      const turn = this.one(
        'SELECT * FROM turns WHERE id=? AND session_id=?',
        String(args.turnId),
        args.sessionId,
      )
      if (!turn || !['pending', 'running'].includes(String(turn.status)))
        throw new ContractError(failure('NOT_FOUND'))
      if (operation === 'internal.chat.agent') {
        const info = agentInfoSchema.parse(args.info)
        this.run(
          'UPDATE turns SET agent_info=? WHERE id=?',
          JSON.stringify(info),
          String(args.turnId),
        )
      } else {
        const tool = agentToolSchema.parse(args.tool)
        const old = this.one('SELECT turn_id,session_id FROM tool_calls WHERE id=?', tool.id)
        if (old && (old.turn_id !== args.turnId || old.session_id !== args.sessionId))
          throw new ContractError(failure('FORBIDDEN'))
        this.run(
          'INSERT INTO tool_calls(id,turn_id,session_id,name,state,payload,position) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,state=excluded.state,payload=excluded.payload',
          tool.id,
          String(args.turnId),
          args.sessionId,
          tool.name,
          tool.state,
          JSON.stringify(tool),
          tool.position,
        )
      }
      return { updated: true }
    }
    if (operation === 'internal.chat.context') {
      if (args.compact) {
        const rows = this.db
          .prepare(
            `SELECT m.role,CASE WHEN length(p.text)>4000 THEN substr(p.text,1,4000)||char(10)||'[Historical excerpt truncated; full text remains in local history]' ELSE p.text END AS text FROM messages m JOIN turns t ON t.id=m.turn_id JOIN message_parts p ON p.message_id=m.id WHERE m.session_id=? AND t.status='completed' AND p.type='text' AND m.role IN ('user','assistant') ORDER BY m.created_at DESC,m.id DESC LIMIT 101`,
          )
          .all(args.sessionId) as Row[]
        const messages = rows
          .slice(0, 100)
          .reverse()
          .map((row) => ({ role: row.role, content: row.text })) as Message[]
        if (rows.length > 100)
          messages.unshift({
            role: 'user',
            content:
              '[Earlier conversation is outside the bounded context window; full history remains in local storage. Do not assume omitted details.]',
          })
        return messages
      }
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
          (session.title === '新任务' || session.title === '新会话')
        )
          this.run(
            'UPDATE sessions SET title=? WHERE id=?',
            String(args.text).replace(/\s+/g, ' ').slice(0, 40),
            args.sessionId,
          )
        this.run('UPDATE sessions SET updated_at=? WHERE id=?', now + 1, args.sessionId)
        if (args.agent)
          this.run(
            'UPDATE turns SET agent_info=? WHERE id=?',
            JSON.stringify(agentInfoSchema.parse(args.agent)),
            String(args.turnId),
          )
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
      return {
        turn: row ? this.turn(row) : null,
        text: String(part?.text ?? ''),
        tools: row ? this.tools(String(row.id)) : [],
      }
    }
    throw new ContractError(failure('INVALID_REQUEST'))
  }
  tools(turnId: string) {
    return (
      this.db
        .prepare(
          "SELECT payload FROM tool_calls WHERE turn_id=? AND payload != '{}' ORDER BY position,id LIMIT 40",
        )
        .all(turnId) as Row[]
    ).map((row) => agentToolSchema.parse(JSON.parse(String(row.payload))))
  }
}
