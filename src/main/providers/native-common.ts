import { z } from 'zod'
import type {
  Compatibility,
  Completion,
  CompletionInput,
  ToolCall,
  Usage,
} from '../../shared/provider-contracts'
import { ProviderError } from './errors'
import { parseJson } from './transport'
export const unknownUsage = (): Usage => ({
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
})
export const natural = z.number().int().nonnegative()
export const identifier = z.string().min(1).max(200)
export function calls(calls: ToolCall[], finish: Completion['finish']) {
  if (
    calls.length > 64 ||
    new Set(calls.map((c) => c.id)).size !== calls.length ||
    (calls.length && finish !== 'tools')
  )
    throw new ProviderError('INVALID_RESPONSE')
  for (const call of calls) {
    if (
      !call.id ||
      call.id.length > 200 ||
      !/^[\w-]{1,200}$/.test(call.name) ||
      call.arguments.length > 262144
    )
      throw new ProviderError('INVALID_RESPONSE')
    const value = parseJson(call.arguments)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ProviderError('INVALID_RESPONSE')
  }
  return calls
}
export function checkInput(
  input: CompletionInput,
  compatibility: Compatibility,
  structured: boolean,
) {
  if (!input.model.trim() || !input.messages.length) throw new ProviderError('BAD_REQUEST')
  if (input.toolChoice && !input.tools?.length) throw new ProviderError('BAD_REQUEST')
  if (
    compatibility.tools === 'disabled' &&
    (input.tools?.length ||
      input.messages.some(
        (m) => m.role === 'tool' || (m.role === 'assistant' && m.toolCalls?.length),
      ))
  )
    throw new ProviderError('UNSUPPORTED')
  if (input.structuredOutput && (!structured || compatibility.structuredOutput !== 'supported'))
    throw new ProviderError('UNSUPPORTED')
  if (
    input.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image'),
    ) &&
    compatibility.vision !== 'supported'
  )
    throw new ProviderError('UNSUPPORTED')
}
