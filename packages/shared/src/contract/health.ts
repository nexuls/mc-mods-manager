import { z } from 'zod'
import { defineEndpoint } from './define'

/** Liveness check. The UI polls it, which also serves as the heartbeat for `--exit-on-close`. */
export const get = defineEndpoint({
  method: 'GET',
  path: '/api/health',
  response: z.strictObject({ ok: z.literal(true), version: z.string() }),
})
