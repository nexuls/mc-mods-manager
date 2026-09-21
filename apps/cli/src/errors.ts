import type { ErrorCode } from '@mc-mod/shared'

/** An expected failure that maps to an `ApiError` response. Throw it from services and routes. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
