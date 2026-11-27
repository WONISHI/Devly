import { z } from 'zod'
const scope = z.object({ projectId: z.uuid() }).strict()
export const scheduleInput = scope
  .extend({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(100),
    prompt: z.string().trim().min(1).max(4000),
    providerId: z.uuid(),
    model: z.string().trim().min(1).max(200),
    intervalSeconds: z.number().int().min(60).max(2592000),
    misfire: z.enum(['skip', 'once']),
    maxRunsPerDay: z.number().int().min(1).max(20).default(5),
    enabled: z.boolean().default(false),
    notify: z.boolean().default(false),
  })
  .strict()
export const scheduleSchema = scheduleInput
  .extend({
    id: z.uuid(),
    revision: z.number().int().positive(),
    nextAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict()
export type LocalSchedule = z.infer<typeof scheduleSchema>
export const scheduleRunSchema = z
  .object({
    id: z.uuid(),
    scheduleId: z.uuid(),
    projectId: z.uuid(),
    dueAt: z.number().int(),
    startedAt: z.number().int(),
    endedAt: z.number().int().nullable(),
    state: z.enum([
      'claimed',
      'running',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'skipped',
    ]),
    sessionId: z.uuid().nullable(),
    turnId: z.uuid().nullable(),
    reason: z.string().max(200).nullable(),
  })
  .strict()
const selection = scope.extend({ id: z.uuid() }).strict()
export const scheduleArguments = {
  'schedules.list': scope,
  'schedules.save': scheduleInput,
  'schedules.stop': selection,
  'schedules.run': selection,
  'schedules.remove': selection,
  'schedules.history': selection,
} as const
const ack = z.object({ removed: z.boolean() }).strict()
export const scheduleResults = {
  'schedules.list': z.array(scheduleSchema).max(10),
  'schedules.save': scheduleSchema,
  'schedules.stop': ack,
  'schedules.run': scheduleRunSchema,
  'schedules.remove': ack,
  'schedules.history': z.array(scheduleRunSchema).max(30),
} as const
