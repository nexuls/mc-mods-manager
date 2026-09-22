import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { ApiErrorSchema, api, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeJar } from '../../test/jar'
import { readState } from '../instance/state'
import { hashBytes } from '../jar/hash'
import type { HashMatch, ProjectInfo } from '../providers/types'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'
import { LibraryService } from '../services/library'

const sodiumJar = makeJar({
  'fabric.mod.json': JSON.stringify({
    id: 'sodium',
    name: 'Sodium',
    version: '0.6.0',
    environment: 'client',
    depends: { minecraft: '1.21.4' },
  }),
})
const localJar = makeJar({
  'fabric.mod.json': JSON.stringify({ id: 'my_mod', name: 'My Mod', version: '1.0' }),
})
const forgeJar = makeJar({
  'META-INF/mods.toml': `modLoader="javafml"\nloaderVersion="[47,)"\n[[mods]]\nmodId="forgy"\nversion="1.0"\n`,
})

const sodium: ProjectInfo = {
  id: 'AANobbMI',
  slug: 'sodium',
  title: 'Sodium',
  description: 'Fast',
  side: 'client',
}
const myMod: ProjectInfo = {
  id: 'MYMOD',
  slug: 'my-mod',
  title: 'My Mod',
  description: 'Mine',
  side: 'both',
}
const sodiumMatch: HashMatch = {
  projectId: sodium.id,
  versionId: 'V1',
  versionNumber: '0.6.0',
  loaders: ['fabric', 'quilt'],
  gameVersions: ['1.21.4'],
}

/** A Prism instance (Fabric 1.21.4) with three jars, one of them known to the fake Modrinth. */
async function setup(options: { offline?: boolean } = {}) {
  const f = await copyFixture('prism')
  const mods = path.join(f.dir, 'minecraft/mods')
  await Bun.write(path.join(mods, 'sodium-fabric-0.6.0.jar'), sodiumJar)
  await Bun.write(path.join(mods, 'my-mod-1.0.jar'), localJar)
  await Bun.write(path.join(mods, 'forgy-1.0.jar.disabled'), forgeJar)

  const fake = fakeModrinth({
    matches: { [hashBytes(sodiumJar).sha1]: sodiumMatch },
    projects: [sodium, myMod],
    offline: options.offline,
  })
  const token = createSessionToken()
  const instance = await InstanceService.load(f.dir)
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: { instance, library: new LibraryService(instance, fake.modrinth, () => 1000) },
    webDir: path.join(f.dir, 'no-web'),
    validateResponses: true,
    onInternalError: (err) => {
      throw err
    },
  })
  const s = await listen(app)
  const request = (method: string, p: string, body?: unknown) =>
    fetch(`${s.url}${p}`, {
      method,
      headers: { [TOKEN_HEADER]: token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const file = (name: string) => `/api/mods/${encodeURIComponent(name)}`
  return {
    dir: f.dir,
    mods,
    calls: fake.calls,
    request,
    file,
    list: async () =>
      api.mods.list.response.parse(await (await request('GET', '/api/mods')).json()),
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('GET identifies new jars once and caches the result in state.json', async () => {
  await using t = await setup()
  const { mods, warnings } = await t.list()
  expect(warnings).toEqual([])
  expect(mods.map((m) => m.fileName)).toEqual([
    'forgy-1.0.jar.disabled',
    'my-mod-1.0.jar',
    'sodium-fabric-0.6.0.jar',
  ])

  const [forgy, mine, sod] = mods
  expect(sod).toMatchObject({
    enabled: true,
    primarySource: 'modrinth',
    compatibility: 'ok',
    side: 'client',
    sideSource: 'platform',
    sources: [
      {
        provider: 'modrinth',
        projectId: sodium.id,
        versionId: 'V1',
        title: 'Sodium',
        method: 'hash',
      },
    ],
  })
  expect(mine).toMatchObject({ sources: [], compatibility: 'ok', side: 'both', sideSource: 'jar' })
  expect(forgy).toMatchObject({
    enabled: false,
    compatibility: 'wrong-loader',
    compatibilityReason: 'Built for Forge',
  })

  const { state } = await readState(t.dir)
  expect(Object.keys(state.jarCache?.files ?? {}).sort()).toEqual([
    'forgy-1.0.jar',
    'my-mod-1.0.jar',
    'sodium-fabric-0.6.0.jar',
  ])
  expect(state.mods?.[sod?.sha1 ?? '']?.checkedAt).toEqual({ modrinth: 1000 })

  await t.list()
  expect(t.calls.identify).toHaveLength(1)

  const refreshed = await t.request('POST', '/api/mods/refresh')
  expect(api.mods.refresh.response.parse(await refreshed.json()).mods).toHaveLength(3)
  expect(t.calls.identify).toHaveLength(2)
})

test('offline: lists jars with a warning and retries the lookup next time', async () => {
  await using t = await setup({ offline: true })
  const { mods, warnings } = await t.list()
  expect(mods).toHaveLength(3)
  expect(mods.every((m) => m.sources.length === 0)).toBe(true)
  expect(warnings[0]).toContain("Couldn't reach Modrinth")
  const { state } = await readState(t.dir)
  expect(state.mods).toEqual({})
})

test('PATCH disables and enables by renaming', async () => {
  await using t = await setup()
  const res = await t.request('PATCH', t.file('sodium-fabric-0.6.0.jar'), { enabled: false })
  expect(res.status).toBe(200)
  expect(api.mods.update.response.parse(await res.json())).toMatchObject({
    fileName: 'sodium-fabric-0.6.0.jar.disabled',
    enabled: false,
    sources: [{ projectId: sodium.id }],
  })
  expect(await readdir(t.mods)).toContain('sodium-fabric-0.6.0.jar.disabled')

  const back = await t.request('PATCH', t.file('sodium-fabric-0.6.0.jar.disabled'), {
    enabled: true,
  })
  expect(api.mods.update.response.parse(await back.json()).fileName).toBe('sodium-fabric-0.6.0.jar')
})

test('PATCH refuses to overwrite an existing file', async () => {
  await using t = await setup()
  await Bun.write(path.join(t.mods, 'sodium-fabric-0.6.0.jar.disabled'), 'x')
  const res = await t.request('PATCH', t.file('sodium-fabric-0.6.0.jar'), { enabled: false })
  expect(res.status).toBe(409)
  expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('CONFLICT')
})

test('PATCH sets and clears the side override', async () => {
  await using t = await setup()
  const set = await t.request('PATCH', t.file('my-mod-1.0.jar'), { sideOverride: 'server' })
  expect(api.mods.update.response.parse(await set.json())).toMatchObject({
    side: 'server',
    sideSource: 'override',
  })
  const cleared = await t.request('PATCH', t.file('my-mod-1.0.jar'), { sideOverride: null })
  expect(api.mods.update.response.parse(await cleared.json())).toMatchObject({ sideSource: 'jar' })
})

test('PATCH links, unlinks and treats as local', async () => {
  await using t = await setup()
  const linked = await t.request('PATCH', t.file('my-mod-1.0.jar'), {
    link: { provider: 'modrinth', projectId: 'my-mod' },
  })
  expect(api.mods.update.response.parse(await linked.json()).sources).toEqual([
    {
      provider: 'modrinth',
      projectId: 'MYMOD',
      slug: 'my-mod',
      title: 'My Mod',
      side: 'both',
      method: 'manual',
    },
  ])
  // The manual link survives a restart (it's in state.json).
  expect((await t.list()).mods.find((m) => m.fileName === 'my-mod-1.0.jar')?.sources).toHaveLength(
    1,
  )

  const local = await t.request('PATCH', t.file('sodium-fabric-0.6.0.jar'), { unlinked: true })
  expect(api.mods.update.response.parse(await local.json())).toMatchObject({
    sources: [],
    unlinked: true,
  })

  const unlinked = await t.request('PATCH', t.file('my-mod-1.0.jar'), { link: null })
  expect(api.mods.update.response.parse(await unlinked.json()).sources).toEqual([])

  const missing = await t.request('PATCH', t.file('my-mod-1.0.jar'), {
    link: { provider: 'modrinth', projectId: 'nope' },
  })
  expect(missing.status).toBe(404)
  const cf = await t.request('PATCH', t.file('my-mod-1.0.jar'), {
    link: { provider: 'curseforge', projectId: '1' },
  })
  expect(ApiErrorSchema.parse(await cf.json()).error.code).toBe('PROVIDER_DISABLED')
})

test('DELETE moves the jar to .mc-mod/trash', async () => {
  await using t = await setup()
  const res = await t.request('DELETE', t.file('my-mod-1.0.jar'))
  expect(api.mods.remove.response.parse(await res.json())).toEqual({
    fileName: 'my-mod-1.0.jar',
    trashPath: path.join('.mc-mod', 'trash', '1000-my-mod-1.0.jar'),
  })
  expect(await readdir(t.mods)).not.toContain('my-mod-1.0.jar')
  expect(await readdir(path.join(t.dir, '.mc-mod/trash'))).toEqual(['1000-my-mod-1.0.jar'])
})

test('file names are validated and must exist', async () => {
  await using t = await setup()
  const missing = await t.request('DELETE', t.file('nope.jar'))
  expect(missing.status).toBe(404)
  for (const name of ['../state.jar', 'x.txt', '.hidden.jar']) {
    const res = await t.request('DELETE', t.file(name))
    expect(res.status).toBe(400)
  }
  expect((await readdir(t.mods)).filter((n) => n.includes('.jar'))).toHaveLength(3)
})

test('GET suggestions: same mod id, then name search', async () => {
  await using t = await setup()
  const res = await t.request('GET', `${t.file('my-mod-1.0.jar')}/suggestions`)
  const { suggestions } = api.mods.suggestions.response.parse(await res.json())
  expect(suggestions).toEqual([
    expect.objectContaining({ projectId: 'MYMOD', reason: 'Same mod id' }),
  ])
  expect(t.calls.search).toEqual(['My Mod'])
})
