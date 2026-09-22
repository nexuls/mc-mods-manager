import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ApiErrorSchema, api, listEndpoints, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../test/fake-modrinth'
import { copyFixture } from '../test/fixtures'
import { listen } from '../test/http'
import { makeServices } from '../test/services'
import { registeredEndpoints } from './routes/adapter'
import { createSessionToken } from './security'
import { createApp } from './server'
import { InstanceService } from './services/instance'
import { VERSION } from './version'

let webDir: string
let fixture: Awaited<ReturnType<typeof copyFixture>>
let services: ReturnType<typeof makeServices>

beforeAll(async () => {
  fixture = await copyFixture('empty')
  const instance = await InstanceService.load(fixture.dir)
  services = makeServices({ instance, modrinth: fakeModrinth().modrinth })
  webDir = await mkdtemp(path.join(tmpdir(), 'mc-mod-web-'))
  await Bun.write(path.join(webDir, 'index.html'), '<!doctype html><title>mc-mod</title>')
  await Bun.write(path.join(webDir, 'assets/app-abc123.js'), 'console.log(1)')
})

afterAll(async () => {
  await rm(webDir, { recursive: true, force: true })
  await fixture[Symbol.asyncDispose]()
})

const token = createSessionToken()
const auth = { mode: 'token', token } as const
const headers = { [TOKEN_HEADER]: token }

const make = () =>
  createApp({ auth, services, webDir, validateResponses: true, onInternalError: () => {} })

test('every contract endpoint is registered', () => {
  const registered = registeredEndpoints(make().apiRouter)
  for (const e of listEndpoints(api)) {
    expect(registered.has(e), `${e.method} ${e.path} has no route`).toBe(true)
  }
})

describe('api', () => {
  test('GET /api/health', async () => {
    let beats = 0
    const { app } = createApp({
      auth,
      services,
      webDir,
      validateResponses: true,
      onHeartbeat: () => beats++,
    })
    await using s = await listen(app)
    const res = await fetch(`${s.url}/api/health`, { headers })
    expect(res.status).toBe(200)
    expect(api.health.get.response.parse(await res.json())).toEqual({ ok: true, version: VERSION })
    expect(beats).toBe(1)
  })

  test('unknown API path is a JSON 404', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/api/nope`, { headers })
    expect(res.status).toBe(404)
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND')
  })

  test('invalid query is a 400 with details', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`${s.url}/api/health?unexpected=1`, { headers })
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
    const { app } = createApp({
      auth,
      services,
      webDir: path.join(webDir, 'missing'),
      validateResponses: true,
    })
    await using s = await listen(app)
    const res = await fetch(`${s.url}/`)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('not built')
  })
})

describe('security', () => {
  test('rejects API requests without the token', async () => {
    await using s = await listen(make().app)
    for (const h of [
      {},
      { [TOKEN_HEADER]: createSessionToken() },
      { [TOKEN_HEADER]: 'x' },
    ] as Record<string, string>[]) {
      const res = await fetch(`${s.url}/api/health`, { headers: h })
      expect(res.status).toBe(401)
      expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('UNAUTHORIZED')
    }
  })

  test('accepts localhost as host', async () => {
    await using s = await listen(make().app)
    const res = await fetch(`http://localhost:${s.port}/api/health`, { headers })
    expect(res.status).toBe(200)
  })

  test('rejects foreign Host headers, even for the web UI', async () => {
    await using s = await listen(make().app)
    for (const p of ['/api/health', '/']) {
      const res = await fetch(`${s.url}${p}`, { headers: { ...headers, host: 'evil.example' } })
      expect(res.status).toBe(403)
    }
  })

  test('dev mode skips the checks', async () => {
    const { app } = createApp({ auth: { mode: 'dev' }, services, webDir, validateResponses: true })
    await using s = await listen(app)
    const res = await fetch(`${s.url}/api/health`, { headers: { host: 'localhost:5173' } })
    expect(res.status).toBe(200)
  })
})
