import { expect, test } from 'bun:test'
import path from 'node:path'
import { ApiErrorSchema, api, type ProjectVersion, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeServices } from '../../test/services'
import type { ProjectInfo } from '../providers/types'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

const sodium: ProjectInfo = {
  id: 'AANobbMI',
  slug: 'sodium',
  title: 'Sodium',
  description: 'Fast',
  side: 'client',
}

const version = (over: Partial<ProjectVersion>): ProjectVersion => ({
  provider: 'modrinth',
  id: 'V',
  projectId: sodium.id,
  name: 'v',
  versionNumber: '1',
  type: 'release',
  publishedAt: '2026-01-01T00:00:00Z',
  downloads: 0,
  loaders: ['fabric'],
  gameVersions: ['1.21.4'],
  file: { name: 'sodium.jar', url: 'https://cdn.modrinth.com/s.jar', size: 1 },
  dependencies: [],
  ...over,
})

/** The prism fixture is a Fabric 1.21.4 instance. */
async function setup() {
  const f = await copyFixture('prism')
  const fake = fakeModrinth({
    projects: [sodium],
    versions: [
      version({ id: 'OLD', publishedAt: '2026-01-01T00:00:00Z' }),
      version({ id: 'NEW', publishedAt: '2026-02-01T00:00:00Z' }),
      version({ id: 'FORGE', loaders: ['forge'] }),
    ],
  })
  const token = createSessionToken()
  const instance = await InstanceService.load(f.dir)
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: makeServices({ instance, modrinth: fake.modrinth }),
    webDir: path.join(f.dir, 'no-web'),
    validateResponses: true,
    onInternalError: (err) => {
      throw err
    },
  })
  const s = await listen(app)
  const get = (p: string) => fetch(`${s.url}${p}`, { headers: { [TOKEN_HEADER]: token } })
  return {
    get,
    calls: fake.calls,
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('GET /api/search filters to the instance by default', async () => {
  await using t = await setup()
  const res = await t.get('/api/search?q=sod&page=1&sort=downloads')
  expect(res.status).toBe(200)
  const body = api.projects.search.response.parse(await res.json())
  expect(body).toMatchObject({
    page: 1,
    pageSize: 20,
    filters: { gameVersion: '1.21.4', loaders: ['fabric'] },
  })
  expect(t.calls.browse[0]).toMatchObject({
    text: 'sod',
    kind: 'mod',
    loaders: ['fabric'],
    gameVersion: '1.21.4',
    sort: 'downloads',
    offset: 20,
  })
})

test('GET /api/search?all=true drops the filters', async () => {
  await using t = await setup()
  const body = api.projects.search.response.parse(
    await (await t.get('/api/search?q=sodium&all=true')).json(),
  )
  expect(body.filters).toEqual({ gameVersion: null, loaders: [] })
  expect(body.hits.map((h) => h.id)).toEqual([sodium.id])
})

test('CurseForge is disabled until a key is set', async () => {
  await using t = await setup()
  const res = await t.get('/api/search?provider=curseforge')
  expect(res.status).toBe(409)
  expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('PROVIDER_DISABLED')
})

test('bad query values are a 400', async () => {
  await using t = await setup()
  for (const q of ['page=-1', 'sort=best', 'category=a%20b', 'all=maybe']) {
    expect((await t.get(`/api/search?${q}`)).status).toBe(400)
  }
})

test('GET /api/projects/:provider/:id', async () => {
  await using t = await setup()
  const res = await t.get('/api/projects/modrinth/sodium')
  expect(api.projects.project.response.parse(await res.json())).toMatchObject({
    id: sodium.id,
    pageUrl: 'https://modrinth.com/project/sodium',
  })
  expect((await t.get('/api/projects/modrinth/nope')).status).toBe(404)
})

test('GET versions: compatible ones, newest release recommended', async () => {
  await using t = await setup()
  const res = await t.get('/api/projects/modrinth/sodium/versions')
  const { versions } = api.projects.versions.response.parse(await res.json())
  expect(versions.map((v) => [v.id, v.recommended])).toEqual([
    ['OLD', false],
    ['NEW', true],
  ])
  expect(t.calls.getVersions[0]?.filter).toEqual({ loaders: ['fabric'], gameVersions: ['1.21.4'] })

  const all = api.projects.versions.response.parse(
    await (await t.get('/api/projects/modrinth/sodium/versions?all=1')).json(),
  )
  expect(all.versions.find((v) => v.id === 'FORGE')).toMatchObject({ compatible: false })
  expect((await t.get('/api/projects/modrinth/nope/versions')).status).toBe(404)
})

test('meta: game versions and categories', async () => {
  await using t = await setup()
  const gv = await t.get('/api/meta/game-versions?includeSnapshots=true')
  expect(api.meta.gameVersions.response.parse(await gv.json()).versions).toContain('24w14a')
  const cats = await t.get('/api/meta/categories?kind=mod')
  expect(api.meta.categories.response.parse(await cats.json()).categories).toHaveLength(1)
})
