import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  ApiErrorSchema,
  api,
  buildPath,
  defineEndpoint,
  listEndpoints,
  SessionToken,
} from './index'

describe('defineEndpoint', () => {
  test('defaults params, query and body to empty strict objects', () => {
    const e = defineEndpoint({ method: 'GET', path: '/api/x', response: z.string() })
    expect(e.params.parse({})).toEqual({})
    expect(() => e.query.parse({ extra: 1 })).toThrow()
  })
})

describe('listEndpoints', () => {
  test('flattens the contract', () => {
    const endpoints = listEndpoints(api)
    expect(endpoints).toContain(api.health.get)
    expect(new Set(endpoints.map((e) => `${e.method} ${e.path}`)).size).toBe(endpoints.length)
  })
})

describe('ApiErrorSchema', () => {
  test('accepts known codes only', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(
      true,
    )
    expect(ApiErrorSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false)
  })
})

describe('SessionToken', () => {
  test('matches 32 base64url bytes', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    expect(SessionToken.safeParse(Buffer.from(bytes).toString('base64url')).success).toBe(true)
    expect(SessionToken.safeParse('short').success).toBe(false)
  })
})

describe('buildPath', () => {
  test('fills and encodes params', () => {
    expect(buildPath('/api/mods/:fileName', { fileName: 'a b/c.jar' })).toBe(
      '/api/mods/a%20b%2Fc.jar',
    )
  })

  test('appends query, skipping undefined and repeating arrays', () => {
    expect(
      buildPath('/api/search', {}, { q: 'sodium', page: 0, x: undefined, tag: ['a', 'b'] }),
    ).toBe('/api/search?q=sodium&page=0&tag=a&tag=b')
  })

  test('throws on a missing param', () => {
    expect(() => buildPath('/api/mods/:fileName')).toThrow('fileName')
  })
})
