import { planRequestSchema, type AgentTool } from '../../shared/agent-contracts'
import { redactToolText, ToolFailure } from './tools'

export function validatePlan(input: string, records: Iterable<AgentTool>, secret: string) {
  if (redactToolText(input, secret) !== input) throw new ToolFailure('SENSITIVE_CONTENT')
  let raw: unknown
  try {
    raw = JSON.parse(input)
  } catch {
    throw new ToolFailure('INVALID_JSON')
  }
  const result = planRequestSchema.safeParse(raw)
  if (!result.success) throw new ToolFailure('INVALID_PLAN')
  const successful = new Set(
    [...records]
      .filter((tool) => tool.state === 'completed' && tool.name !== 'update_plan')
      .map((tool) => tool.callId),
  )
  for (const step of result.data.steps)
    if (
      step.state === 'completed' &&
      (!step.callIds.length || step.callIds.some((id) => !successful.has(id)))
    )
      throw new ToolFailure('PLAN_EVIDENCE_REQUIRED')
  return result.data.steps
}
