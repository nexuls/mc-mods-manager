import { z } from 'zod'
import { defineEndpoint } from './define'
import { ErrorCode } from './errors'

export const JobId = z.uuid()

/** Index of the item in the request that started the job. */
const Index = z.number().int().nonnegative()

/** One Server-Sent Event of a job, sent as `data: <json>`. The stream ends after `done`. */
export const JobEvent = z.discriminatedUnion('type', [
  /** Download progress of one item, in bytes. `total` is 0 when unknown. */
  z.strictObject({
    type: z.literal('progress'),
    index: Index,
    received: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** `skipped`: the same file was already there. */
  z.strictObject({
    type: z.literal('item-done'),
    index: Index,
    fileName: z.string(),
    skipped: z.boolean(),
  }),
  z.strictObject({
    type: z.literal('item-failed'),
    index: Index,
    code: ErrorCode,
    message: z.string(),
  }),
  z.strictObject({
    type: z.literal('done'),
    installed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
])
export type JobEvent = z.infer<typeof JobEvent>

/**
 * A job's events as Server-Sent Events. Events sent before the client connected are replayed first.
 * `response` is the schema of one event.
 */
export const events = defineEndpoint({
  method: 'GET',
  path: '/api/jobs/:id/events',
  params: z.strictObject({ id: JobId }),
  response: JobEvent,
})
