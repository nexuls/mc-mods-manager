import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ApiErrorSchema, api, listEndpoints } from '@mc-mod/shared'
import { listen } from '../test/http'
import { registeredEndpoints } from './routes/adapter'
import { createApp } from './server'
import { VERSION } from './version'

let webDir: string

beforeAll(async () => {
  webDir = await mkdtemp(path.join(tmpdir(), 'mc-mod-web-'))
  await Bun.write(path.join(webDir, 'index.html'), '<!doctype html><title>mc-mod</title>')
  await Bun.write(path.join(webDir, 'assets/app-abc123.js'), 'console.log(1)')
})

afterAll(async () => {
  await rm(webDir, { recursive: true, force: true })
})

const make = () => createApp({ webDir, validateResponses: true, onInternalError: () => {} })

test('every contract endpoint is registered', () => {
  const registered = registeredEndpoints(make().apiRouter)
  for (const e of listEndpoints(api)) {
    expect(registered.has(e), `${e.method} ${e.path} has no route`).toBe(true)
  }
})

describe('api', () => {
  test('GET /api/health', async () => {
    let beats = 0
    const { app } = createApp({ webDir, validateResponses: true, onHeartbeat: () => beats++ })
    await using s = await listen(app)
    const res = await fetch(`${s.url}/api/health`)
    expect(res.status).toBe(200)
    expect(api.health.get.response.parse(await res.json())).toEqual({ ok: true, version: VERSION })
    expect(beats).toBe(1)
  })

  test('unknown API path is a JSON 404', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/api/nope`)
    expect(res.status).toBe(404)
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND')
  })

  test('invalid query is a 400 with details', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/api/health?unexpected=1`)
    expect(res.status).toBe(400)
    const body = ApiErrorSchema.parse(await res.json())
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.details).toBeDefined()
  })
})

describe('web', () => {
  test('serves hashed assets with long caching', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/assets/app-abc123.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  test('falls back to index.html for client routes', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/browse/some/route`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('<title>mc-mod</title>')
  })

  test('explains a missing web build', async () => {
    const { app } = createApp({ webDir: path.join(webDir, 'missing'), validateResponses: true })
    await using s = await listen(app)
    const res = await fetch(`${s.url}/`)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('not built')
  })
})
