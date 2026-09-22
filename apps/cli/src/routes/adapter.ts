import { type ApiError, type Endpoint, errorStatus, type Input, type Res } from '@mc-mod/shared'
import { type ErrorRequestHandler, type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { AppError } from '../errors'

interface RouterInfo {
  validateResponses: boolean
  endpoints: Set<Endpoint>
}

const routers = new WeakMap<Router, RouterInfo>()

export interface ApiRouterOptions {
  /** Parse every response against the contract. On in dev and tests, to catch contract drift. */
  validateResponses: boolean
}

/** A router that `route()` can register contract endpoints on. */
export function createApiRouter(options: ApiRouterOptions): Router {
  const router = Router()
  routers.set(router, { ...options, endpoints: new Set() })
  return router
}

/** Endpoints registered on a router made by `createApiRouter` (used by the contract coverage test). */
export function registeredEndpoints(router: Router): ReadonlySet<Endpoint> {
  return routerInfo(router).endpoints
}

/** Registers a contract endpoint. The only way `/api` routes get added. */
export function route<E extends Endpoint>(
  router: Router,
  e: E,
  handler: (input: Input<E>) => Promise<Res<E>>,
): void {
  const info = routerInfo(router)
  info.endpoints.add(e)

  const method = e.method.toLowerCase() as Lowercase<E['method']>
  router.route(e.path)[method](async (req, res, next) => {
    try {
      const input: Input<E> = {
        // Explicit generics keep the outputs tied to E; schema.parse() would return unknown here.
        params: z.parse<E['params']>(e.params, req.params),
        query: z.parse<E['query']>(e.query, req.query),
        body: z.parse<E['body']>(e.body, req.body ?? {}),
      }
      const out = await handler(input)
      if (!info.validateResponses) {
        res.json(out)
        return
      }
      const checked = z.safeParse(e.response, out)
      if (!checked.success) {
        throw new AppError(
          'INTERNAL',
          `Response of ${e.method} ${e.path} does not match the contract`,
          z.flattenError(checked.error),
        )
      }
      res.json(checked.data)
    } catch (err) {
      next(err)
    }
  })
}

function routerInfo(router: Router): RouterInfo {
  const info = routers.get(router)
  if (!info) throw new Error('Router was not created with createApiRouter()')
  return info
}

export function sendError(
  res: Parameters<RequestHandler>[1],
  code: ApiError['error']['code'],
  message: string,
  details?: unknown,
): void {
  const body: ApiError = { error: { code, message, details } }
  res.status(errorStatus[code]).json(body)
}

/** 404 for `/api` paths no endpoint matched. */
export const apiNotFound: RequestHandler = (req, res) => {
  sendError(res, 'NOT_FOUND', `No API endpoint for ${req.method} ${req.path}`)
}

/** Maps thrown errors to the `ApiError` body. Must be registered last. */
export function errorHandler(onInternalError: (err: unknown) => void): ErrorRequestHandler {
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    if (err instanceof z.ZodError) {
      sendError(res, 'BAD_REQUEST', 'Invalid request', z.flattenError(err))
    } else if (err instanceof AppError) {
      if (err.code === 'INTERNAL') onInternalError(err)
      sendError(res, err.code, err.message, err.details)
    } else if (isBodyParserError(err)) {
      sendError(res, 'BAD_REQUEST', err.message)
    } else {
      onInternalError(err)
      sendError(res, 'INTERNAL', 'Internal server error')
    }
  }
}

/** body-parser errors (malformed JSON, too large) carry a 4xx `status` and an `expose` flag. */
function isBodyParserError(err: unknown): err is Error & { status: number } {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  )
}

/**
 * Registers a contract endpoint that answers with Server-Sent Events. `e.response` is the schema of one
 * event, each sent as `data: <json>`. The handler runs (and may throw, for a normal JSON error) before
 * the stream starts; its iterable is stopped when the client disconnects.
 */
export function streamRoute<E extends Endpoint>(
  router: Router,
  e: E,
  handler: (input: Input<E>, signal: AbortSignal) => Promise<AsyncIterable<Res<E>>>,
): void {
  const info = routerInfo(router)
  info.endpoints.add(e)

  const method = e.method.toLowerCase() as Lowercase<E['method']>
  router.route(e.path)[method](async (req, res, next) => {
    const closed = new AbortController()
    res.on('close', () => closed.abort())
    let events: AsyncIterable<Res<E>>
    try {
      events = await handler(
        {
          params: z.parse<E['params']>(e.params, req.params),
          query: z.parse<E['query']>(e.query, req.query),
          body: z.parse<E['body']>(e.body, req.body ?? {}),
        },
        closed.signal,
      )
    } catch (err) {
      next(err)
      return
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()
    try {
      for await (const event of events) {
        const out = info.validateResponses ? z.parse(e.response, event) : event
        res.write(`data: ${JSON.stringify(out)}\n\n`)
      }
      res.end()
    } catch (err) {
      // Headers are sent, so this can't become a JSON error; express closes the connection.
      next(err)
    }
  })
}
