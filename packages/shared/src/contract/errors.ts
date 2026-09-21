import { z } from 'zod'

export const ErrorCode = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PROVIDER_ERROR',
  'PROVIDER_DISABLED',
  'RATE_LIMITED',
  'HASH_MISMATCH',
  'MANUAL_DOWNLOAD_REQUIRED',
  'INTERNAL',
])
export type ErrorCode = z.infer<typeof ErrorCode>

/** HTTP status the backend sends for each error code. */
export const errorStatus: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PROVIDER_ERROR: 502,
  PROVIDER_DISABLED: 409,
  RATE_LIMITED: 429,
  HASH_MISMATCH: 502,
  MANUAL_DOWNLOAD_REQUIRED: 409,
  INTERNAL: 500,
}

/** Body of every non-2xx `/api` response. */
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>
