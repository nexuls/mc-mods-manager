import { randomBytes, timingSafeEqual } from 'node:crypto'
import { TOKEN_HEADER } from '@mc-mod/shared'
import type { RequestHandler } from 'express'
import { sendError } from './routes/adapter'

/** How requests are authenticated. `dev` skips all checks and is only reachable with MC_MOD_DEV=1. */
export type Auth = { mode: 'token'; token: string } | { mode: 'dev' }

/** A fresh per-run session token: 32 random bytes, base64url. */
export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Rejects requests whose Host header isn't `127.0.0.1:<port>` or `localhost:<port>`.
 * Blocks DNS rebinding, where a malicious domain resolves to 127.0.0.1.
 */
export const checkHost: RequestHandler = (req, res, next) => {
  const port = req.socket.localPort
  const host = req.headers.host?.toLowerCase()
  if (host === `127.0.0.1:${port}` || host === `localhost:${port}`) {
    next()
    return
  }
  sendError(res, 'FORBIDDEN', 'Unexpected Host header')
}

/** Requires the session token header on every request it guards (mounted on `/api`). */
export function requireToken(token: string): RequestHandler {
  const expected = Buffer.from(token)
  return (req, res, next) => {
    const got = Buffer.from(req.get(TOKEN_HEADER) ?? '')
    if (got.length === expected.length && timingSafeEqual(got, expected)) {
      next()
      return
    }
    sendError(res, 'UNAUTHORIZED', 'Missing or invalid session token')
  }
}
