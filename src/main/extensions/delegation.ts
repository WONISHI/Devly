import { z } from 'zod'
import type { Tool } from '../../shared/provider-contracts'
export const childRequest = z
  .object({
    tasks: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(8192),
            mode: z.enum(['read-only', 'project-write']),
            maxTokens: z.number().int().min(256).max(1000000),
            maxCalls: z.number().int().min(1).max(40),
            maxOutputChars: z.number().int().min(1024).max(262144),
            maxDurationMs: z.number().int().min(1000).max(300000),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict()
export const delegationTool: Tool = {
  name: 'spawn_agents',
  description:
    'Propose one or two isolated child tasks with explicit token/call/output/time reservations from the remaining parent budget. Requires exact user approval before creating branches. Children inherit this Provider/model and a permission ceiling, cannot delegate again, and get separate worktrees, logs and approvals. Parent yields its run permit while waiting; cancellation propagates. Unknown token usage consumes the requested output reservation. Reserve enough tokens for all child model rounds.',
  parameters: z.toJSONSchema(childRequest) as Record<string, unknown>,
}
