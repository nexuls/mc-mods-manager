import { z } from 'zod'
import { Instance, InstanceOverrides } from '../domain/instance'
import { defineEndpoint } from './define'

export const InstanceResponse = z.strictObject({
  instance: Instance,
  /** Game version or loader unknown: the UI opens the setup dialog. */
  needsSetup: z.boolean(),
})
export type InstanceResponse = z.infer<typeof InstanceResponse>

export const get = defineEndpoint({
  method: 'GET',
  path: '/api/instance',
  response: InstanceResponse,
})

/** Replaces the saved overrides (omitted fields = detect again) and re-runs detection. */
export const update = defineEndpoint({
  method: 'PUT',
  path: '/api/instance',
  body: InstanceOverrides,
  response: InstanceResponse,
})
