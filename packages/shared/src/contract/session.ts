import { z } from 'zod'

/** Header that carries the per-run session token on every `/api` request. */
export const TOKEN_HEADER = 'X-MC-Mod-Token'

/** URL search param the CLI uses to hand the token to the browser. */
export const TOKEN_PARAM = 't'

/** 32 random bytes, base64url-encoded without padding. */
export const SessionToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export type SessionToken = z.infer<typeof SessionToken>
