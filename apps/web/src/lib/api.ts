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

function send<E extends Endpoint>(
  e: E,
  req: Partial<Req<E>>,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set(TOKEN_HEADER, token)

  let body: string | undefined
  if (req.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(z.parse(e.body, req.body))
  }
  return fetch(buildPath(e.path, req.params ?? {}, req.query ?? {}), {
    method: e.method,
    headers,
    body,
    signal,
  })
}

async function failure(res: Response): Promise<ApiClientError> {
  const json: unknown = await res.json().catch(() => undefined)
  const parsed = ApiErrorSchema.safeParse(json)
  return new ApiClientError(
    res.status,
    parsed.success
      ? parsed.data.error
      : { code: 'INTERNAL', message: `Request failed with HTTP ${res.status}` },
  )
}

/** Calls a contract endpoint: validates the body before sending and the response after. */
export async function call<E extends Endpoint>(e: E, req: Partial<Req<E>> = {}): Promise<Res<E>> {
  const res = await send(e, req)
  if (!res.ok) throw await failure(res)
  const json: unknown = await res.json().catch(() => undefined)
  return z.parse<E['response']>(e.response, json)
}

/**
 * Reads a Server-Sent Events endpoint (`data: <json>` per event), validating each event against
 * `e.response`. Resolves when the server ends the stream. Uses fetch because EventSource can't send
 * the token header.
 */
export async function stream<E extends Endpoint>(
  e: E,
  req: Partial<Req<E>>,
  onEvent: (event: Res<E>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await send(e, req, signal)
  if (!res.ok) throw await failure(res)
  if (!res.body) return
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data) continue
      const json: unknown = JSON.parse(data)
      onEvent(z.parse<E['response']>(e.response, json))
    }
  }
}

/** A message for a toast or inline error: the API's message, or a generic one. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message
  if (err instanceof TypeError) return "Can't reach mc-mod. Is it still running in the terminal?"
  return 'Something went wrong'
}
