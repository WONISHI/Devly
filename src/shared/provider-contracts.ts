import { z } from 'zod'

export const capabilityState = z.enum(['unknown', 'supported', 'unsupported'])
export const compatibilitySchema = z
  .object({
    tokenParameter: z.enum(['max_tokens', 'max_completion_tokens', 'omit']).default('max_tokens'),
    temperature: z.number().min(0).max(2).nullable().default(null),
    streamUsage: z.boolean().default(false),
    tools: z.enum(['auto', 'disabled']).default('auto'),
    vision: capabilityState.default('unknown'),
    structuredOutput: capabilityState.default('unknown'),
    contextWindow: z.number().int().min(256).max(10000000).nullable().default(null),
  })
  .strict()
export type Compatibility = z.infer<typeof compatibilitySchema>
export const defaultCompatibility = compatibilitySchema.parse({})
export const providerErrorSchema = z
  .object({
    code: z.enum([
      'AUTHENTICATION',
      'ACCESS_DENIED',
      'RATE_LIMITED',
      'SERVER_ERROR',
      'TIMEOUT',
      'CANCELLED',
      'NETWORK',
      'DISCONNECTED',
      'INVALID_RESPONSE',
      'BAD_REQUEST',
      'UNSUPPORTED',
      'CREDENTIAL',
      'CONFIG_CHANGED',
      'LIMIT',
    ]),
    message: z.string().max(200),
    status: z.number().int().nullable(),
    retryAfterSeconds: z.number().nonnegative().nullable(),
  })
  .strict()
export type ProviderErrorInfo = z.infer<typeof providerErrorSchema>
export const usageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
  })
  .strict()
export type Usage = z.infer<typeof usageSchema>
export const probeKind = z.enum(['text', 'streaming', 'tools', 'structuredOutput', 'models'])
export type ProbeKind = z.infer<typeof probeKind>
export const probeCheckSchema = z
  .object({
    kind: probeKind,
    ok: z.boolean(),
    checkedAt: z.number().int(),
    error: providerErrorSchema.nullable(),
    usage: usageSchema.nullable(),
  })
  .strict()
export type ProbeCheck = z.infer<typeof probeCheckSchema>
export const providerReportSchema = z.object({ checks: z.array(probeCheckSchema).max(5) }).strict()
export type ProviderReport = z.infer<typeof providerReportSchema>
export const probeSnapshotSchema = z
  .object({
    runId: z.uuid(),
    providerId: z.uuid(),
    model: z.string().max(200),
    state: z.enum(['running', 'completed', 'failed', 'cancelled']),
    phase: probeKind,
    checks: z.array(probeCheckSchema).max(5),
    preview: z.string().max(4096),
    models: z.array(z.string().min(1).max(200)).max(1000),
    startedAt: z.number().int(),
    endedAt: z.number().int().nullable(),
  })
  .strict()
export type ProbeSnapshot = z.infer<typeof probeSnapshotSchema>

// Business-facing types contain no OpenAI-specific choice/delta/function wrappers.
export type ToolCall = { id: string; name: string; arguments: string }
export type Message =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'user'
      content: Array<{ type: 'text'; text: string } | { type: 'image'; url: string }>
    }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string }
export type Tool = { name: string; description: string; parameters: Record<string, unknown> }
export type CompletionInput = {
  model: string
  messages: Message[]
  maxTokens?: number
  tools?: Tool[]
  toolChoice?: 'auto' | 'required'
  structuredOutput?: { name: string; schema: Record<string, unknown> }
}
export type Completion = {
  text: string
  toolCalls: ToolCall[]
  usage: Usage
  finish: 'stop' | 'tools' | 'length' | 'filtered' | 'unknown'
}
export type ProviderStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'finish'; result: Completion }
export interface ProviderAdapter {
  readonly capabilities: {
    text: z.infer<typeof capabilityState>
    streaming: z.infer<typeof capabilityState>
    tools: z.infer<typeof capabilityState>
    vision: z.infer<typeof capabilityState>
    structuredOutput: z.infer<typeof capabilityState>
    contextWindow: number | null
  }
  complete(input: CompletionInput, signal: AbortSignal): Promise<Completion>
  stream(input: CompletionInput, signal: AbortSignal): AsyncGenerator<ProviderStreamEvent>
  models(signal: AbortSignal): Promise<string[]>
}
