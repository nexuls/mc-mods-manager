import {
  type ApiError,
  ApiErrorSchema,
  buildPath,
  type Endpoint,
  type Req,
  type Res,
  TOKEN_HEADER,
} from '@mc-mod/shared'
import { z } from 'zod'
import { getToken } from './storage'

/** A non-2xx `/api` response. `code` is `INTERNAL` when the body wasn't an `ApiError` (e.g. a proxy error page). */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiError['error']['code']
  readonly details: unknown

  constructor(status: number, error: ApiError['error']) {
    super(error.message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = error.code
    this.details = error.details
  }
}

/** Calls a contract endpoint: validates the body before sending and the response after. */
export async function call<E extends Endpoint>(e: E, req: Partial<Req<E>> = {}): Promise<Res<E>> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set(TOKEN_HEADER, token)

  let body: string | undefined
  if (req.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(z.parse(e.body, req.body))
  }

  const res = await fetch(buildPath(e.path, req.params ?? {}, req.query ?? {}), {
    method: e.method,
    headers,
    body,
  })
  const json: unknown = await res.json().catch(() => undefined)

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json)
    throw new ApiClientError(
      res.status,
      parsed.success
        ? parsed.data.error
        : { code: 'INTERNAL', message: `Request failed with HTTP ${res.status}` },
    )
  }
  return z.parse<E['response']>(e.response, json)
}
