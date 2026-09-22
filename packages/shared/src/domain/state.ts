import { z } from 'zod'
import { InstanceOverrides } from './instance'

/**
 * `<instance>/.mc-mod/state.json`. A cache/annotation layer: deleting it must never break anything.
 * Loose at the top level so fields written by a newer mc-mod survive a round trip through an older one.
 */
export const State = z.looseObject({
  schemaVersion: z.literal(1),
  instance: InstanceOverrides.optional(),
})
export type State = z.infer<typeof State>

export const emptyState = (): State => ({ schemaVersion: 1 })
