import { z } from 'zod'

/** Where a mod has to be installed. `unknown` mods are included in server exports for review. */
export const Side = z.enum(['client', 'server', 'both', 'unknown'])
export type Side = z.infer<typeof Side>
