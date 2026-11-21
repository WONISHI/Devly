import { z } from 'zod'
import {
  dataPayloadSchema,
  dataResponseSchema,
  type DataArgs,
  type DataOperation,
  type DataResult,
} from './data-contracts'

export const IPC = { request: 'devly:request', event: 'devly:event' } as const
export const projectPathSchema = z.string().min(1).max(8192)
const id = z.uuid()
const empty = z.object({}).strict()
export const environmentSchema = z
  .object({
    appVersion: z.string(),
    electron: z.string(),
    node: z.string(),
    platform: z.string(),
    git: z.string().nullable(),
    // v1 compatibility field; normal startup does not probe the optional Codex engine.
    codex: z.string().nullable(),
  })
  .strict()
export const projectSchema = z.object({ path: projectPathSchema, name: z.string().min(1) }).strict()
export type Project = z.infer<typeof projectSchema>
export type EnvironmentInfo = z.infer<typeof environmentSchema>
const base = { version: z.literal(1), requestId: id }
export const requestIdentitySchema = z.object({ requestId: id })
export const requestSchema = z.discriminatedUnion('method', [
  z.object({ ...base, method: z.literal('app.environment'), payload: empty }).strict(),
  z.object({ ...base, method: z.literal('data.execute'), payload: dataPayloadSchema }).strict(),
  z.object({ ...base, method: z.literal('project.open'), payload: empty }).strict(),
  z
    .object({
      ...base,
      method: z.literal('events.subscribe'),
      payload: z.object({ type: z.literal('environment.checked') }).strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      method: z.literal('events.unsubscribe'),
      payload: z.object({ subscriptionId: id }).strict(),
    })
    .strict(),
])
export type Request = z.infer<typeof requestSchema>
export type Method = Request['method']
export const errorSchema = z
  .object({
    code: z.enum([
      'INVALID_REQUEST',
      'FORBIDDEN',
      'INTERNAL_ERROR',
      'INVALID_RESPONSE',
      'TRANSPORT_ERROR',
      'NOT_FOUND',
      'STORAGE_UNAVAILABLE',
      'CREDENTIAL_UNAVAILABLE',
      'PROJECT_UNAVAILABLE',
      'LIMIT_EXCEEDED',
      'CHAT_BUSY',
      'HISTORY_CONFIRMATION_REQUIRED',
      'BINDING_CHANGED',
      'CONTEXT_LIMIT',
    ]),
    message: z.string(),
    retryable: z.boolean(),
  })
  .strict()
export type ErrorInfo = z.infer<typeof errorSchema>
export const responseSchema = z.discriminatedUnion('ok', [
  z.object({ ...base, ok: z.literal(true), data: z.unknown() }).strict(),
  z
    .object({
      version: z.literal(1),
      requestId: id.nullable(),
      ok: z.literal(false),
      error: errorSchema,
    })
    .strict(),
])
export type Response = z.infer<typeof responseSchema>
export const resultSchemas = {
  'app.environment': environmentSchema,
  'data.execute': dataResponseSchema,
  'project.open': projectSchema.nullable(),
  'events.subscribe': z.object({ subscriptionId: id }).strict(),
  'events.unsubscribe': z.object({ removed: z.boolean() }).strict(),
}
export const eventSchema = z
  .object({
    version: z.literal(1),
    subscriptionId: id,
    sequence: z.number().int().positive(),
    type: z.literal('environment.checked'),
    requestId: id,
    data: environmentSchema,
  })
  .strict()
export type EnvironmentEvent = z.infer<typeof eventSchema>
export type OperationResult<T> = { ok: true; data: T } | { ok: false; error: ErrorInfo }
export interface DesktopClient {
  data<K extends DataOperation>(operation: K, args: DataArgs<K>): Promise<DataResult<K>>
  getEnvironment(): Promise<EnvironmentInfo>
  openProject(): Promise<Project | null>
  onEnvironmentChecked(
    listener: (event: EnvironmentEvent) => void,
    onError: (error: ErrorInfo) => void,
  ): () => void
}
// Error custom properties do not survive Electron contextBridge. Copy an explicit DTO instead.
export interface DesktopAPI {
  readonly platform: string
  data<K extends DataOperation>(
    operation: K,
    args: DataArgs<K>,
  ): Promise<OperationResult<DataResult<K>>>
  getEnvironment(): Promise<OperationResult<EnvironmentInfo>>
  openProject(): Promise<OperationResult<Project | null>>
  onEnvironmentChecked: DesktopClient['onEnvironmentChecked']
}
export function unwrapResult<T>(result: OperationResult<T>): T {
  if (!result.ok) throw new ContractError(result.error)
  return result.data
}
export class ContractError extends Error {
  constructor(public readonly info: ErrorInfo) {
    super(info.message)
    this.name = 'ContractError'
  }
}
export function failure(code: ErrorInfo['code']): ErrorInfo {
  const messages: Record<ErrorInfo['code'], string> = {
    CHAT_BUSY: '此会话正在生成，请先停止或等待完成',
    HISTORY_CONFIRMATION_REQUIRED: '切换前请确认是否允许将此会话历史发送给新供应商',
    BINDING_CHANGED: '会话模型或供应商配置已改变，请重新选择后发送',
    CONTEXT_LIMIT: '会话已达到当前上下文限制，请新建会话后继续；历史不会被静默截断',
    NOT_FOUND: '记录不存在或不属于当前项目',
    STORAGE_UNAVAILABLE: '本地存储不可用，请重启应用后重试',
    CREDENTIAL_UNAVAILABLE: '系统凭据保护不可用或无法读取密钥，请在当前应用重新设置',
    PROJECT_UNAVAILABLE: '项目目录不存在或无法访问，请重新选择',
    LIMIT_EXCEEDED: '已达到存储或请求限额',
    INVALID_REQUEST: '请求参数无效',
    FORBIDDEN: '请求不属于当前窗口或页面',
    INTERNAL_ERROR: '桌面操作失败，请重试',
    INVALID_RESPONSE: '桌面响应不符合契约',
    TRANSPORT_ERROR: '桌面连接不可用，请重试',
  }
  return {
    code,
    message: messages[code],
    retryable: code === 'INTERNAL_ERROR' || code === 'TRANSPORT_ERROR',
  }
}
export function decodeResponse(method: Method, requestId: string, raw: unknown): unknown {
  const parsed = responseSchema.safeParse(raw)
  if (!parsed.success || parsed.data.requestId !== requestId)
    throw new ContractError(failure('INVALID_RESPONSE'))
  if (!parsed.data.ok) throw new ContractError(parsed.data.error)
  const result = resultSchemas[method].safeParse(parsed.data.data)
  if (!result.success) throw new ContractError(failure('INVALID_RESPONSE'))
  return result.data
}
