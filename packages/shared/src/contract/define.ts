import { z } from 'zod'

export const Method = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
export type Method = z.infer<typeof Method>

/** One `/api` route: its method, express-style path and the zod schemas for every part of the exchange. */
export interface Endpoint<
  P extends z.ZodType = z.ZodType,
  Q extends z.ZodType = z.ZodType,
  B extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  method: Method
  /** Express-style path, e.g. `/api/mods/:fileName`. */
  path: string
  params: P
  query: Q
  body: B
  response: R
}

const none = z.strictObject({})
type None = typeof none

export function defineEndpoint<
  P extends z.ZodType = None,
  Q extends z.ZodType = None,
  B extends z.ZodType = None,
  R extends z.ZodType = z.ZodType,
>(e: {
  method: Method
  path: string
  params?: P
  query?: Q
  body?: B
  response: R
}): Endpoint<P, Q, B, R> {
  // The defaults only apply to omitted generics, whose type is exactly `None`.
  return { params: none, query: none, body: none, ...e } as Endpoint<P, Q, B, R>
}

/** What a caller passes: schema inputs, before defaults and transforms. */
export type Req<E extends Endpoint> = {
  params: z.input<E['params']>
  query: z.input<E['query']>
  body: z.input<E['body']>
}

/** What a handler receives: parsed schema outputs. */
export type Input<E extends Endpoint> = {
  params: z.output<E['params']>
  query: z.output<E['query']>
  body: z.output<E['body']>
}

export type Res<E extends Endpoint> = z.output<E['response']>

/** Flattens a (nested) contract object into its endpoints. */
export function listEndpoints(contract: object): Endpoint[] {
  return Object.values(contract).flatMap((v: unknown): Endpoint[] => {
    if (isEndpoint(v)) return [v]
    return typeof v === 'object' && v !== null ? listEndpoints(v) : []
  })
}

function isEndpoint(v: unknown): v is Endpoint {
  return (
    typeof v === 'object' &&
    v !== null &&
    'method' in v &&
    'path' in v &&
    'response' in v &&
    v.response instanceof z.ZodType
  )
}

/** Fills `:param` segments (URL-encoded) and appends the query string. Undefined query values are skipped. */
export function buildPath(path: string, params: object = {}, query: object = {}): string {
  const values = new Map(Object.entries(params))
  const filled = path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
    const v = values.get(name)
    if (v === undefined || v === null) throw new Error(`Missing path param "${name}" for ${path}`)
    return encodeURIComponent(String(v))
  })
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item !== undefined && item !== null) search.append(k, String(item))
    }
  }
  const qs = search.toString()
  return qs ? `${filled}?${qs}` : filled
}
