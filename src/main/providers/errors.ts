import type { ProviderErrorInfo } from '../../shared/provider-contracts'

const messages: Record<ProviderErrorInfo['code'], string> = {
  AUTHENTICATION: '认证失败（401），请替换密钥',
  ACCESS_DENIED: '访问被拒绝（403），请检查模型权限',
  RATE_LIMITED: '请求限流（429），请稍后手动重试',
  SERVER_ERROR: '供应商服务异常（5xx），请稍后重试',
  TIMEOUT: '请求超时，请核对网络与供应商状态后手动重试',
  CANCELLED: '已取消请求',
  NETWORK: '网络连接失败，请检查地址与网络',
  DISCONNECTED: '响应中断，未收到完整结束标记',
  INVALID_RESPONSE: '供应商响应不符合协议或能力检查要求',
  BAD_REQUEST: '供应商拒绝请求，请检查模型 ID 和兼容参数',
  UNSUPPORTED: '此协议或能力未启用，请检查兼容设置',
  CREDENTIAL: '无法读取受保护密钥，请重新设置密钥或检查系统保护',
  CONFIG_CHANGED: '供应商配置已改变，本次请求已停止，请核对配置后重试',
  LIMIT: '响应或并发检查超过限制',
}
export class ProviderError extends Error {
  readonly info: ProviderErrorInfo
  constructor(
    code: ProviderErrorInfo['code'],
    status: number | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(messages[code])
    this.info = { code, message: messages[code], status, retryAfterSeconds }
  }
}
export function providerError(error: unknown, signal?: AbortSignal): ProviderError {
  if (signal?.aborted)
    return signal.reason instanceof ProviderError ? signal.reason : new ProviderError('CANCELLED')
  if (error instanceof ProviderError) return error
  return new ProviderError('NETWORK')
}
export function httpError(response: Response): ProviderError {
  const code =
    response.status === 401
      ? 'AUTHENTICATION'
      : response.status === 403
        ? 'ACCESS_DENIED'
        : response.status === 429
          ? 'RATE_LIMITED'
          : response.status >= 500
            ? 'SERVER_ERROR'
            : 'BAD_REQUEST'
  const header = response.headers.get('retry-after')
  const seconds =
    header === null
      ? null
      : /^\d+$/.test(header)
        ? Number(header)
        : Math.max(0, Math.ceil((Date.parse(header) - Date.now()) / 1000))
  return new ProviderError(
    code,
    response.status,
    seconds !== null && Number.isFinite(seconds) ? Math.min(seconds, 86400) : null,
  )
}
