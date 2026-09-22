import { z } from 'zod'

// Query-string helpers: values arrive as strings, callers pass real booleans/numbers.

/** `true`/`false` from a caller, or `"true"`/`"false"`/`"1"`/`"0"` from the query string. */
export const QueryBool = z.union([z.boolean(), z.stringbool()])

/** A non-negative integer from a caller or the query string. */
export const QueryInt = z.union([
  z.number().int().min(0),
  z
    .string()
    .regex(/^\d{1,9}$/)
    .transform(Number),
])
