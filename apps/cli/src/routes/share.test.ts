import { expect, test } from 'bun:test'
import path from 'node:path'
import {
  api,
  MOD_LIST_FORMAT,
  type ModList,
  type ProjectVersion,
  TOKEN_HEADER,
} from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeJar } from '../../test/jar'
import { makeServices } from '../../test/services'
import { hashBytes } from '../jar/hash'
import type { ProjectInfo } from '../providers/types'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

const lithiumJar = makeJar({
  'fabric.mod.json': JSON.stringify({ id: 'lithium', name: 'Lithium', version: '0.14' }),
})
const localJar = makeJar({
  'fabric.mod.json': JSON.stringify({ id: 'homemade', name: 'Homemade', version: '0.1' }),
})
const lithiumHashes = hashBytes(lithiumJar)

const lithium: ProjectInfo = {
  id: 'gvQqBUqZ',
  slug: 'lithium',
  title: 'Lithium',
  description: '',
  side: 'both',
}
const sodium: ProjectInfo = {
  id: 'AANobbMI',
  slug: 'sodium',
  title: 'Sodium',
  description: '',
  side: 'client',
}

const version = (over: Partial<ProjectVersion> = {}): ProjectVersion => ({
  provider: 'modrinth',
  id: 'LITH1',
  projectId: lithium.id,
  name: 'Lithium 0.14',
  versionNumber: '0.14',
  type: 'release',
  publishedAt: '2026-01-01T00:00:00Z',
  downloads: 0,
  loaders: ['fabric'],
  gameVersions: ['1.21.4'],
  file: {
    name: 'lithium-0.14.jar',
    url: 'https://cdn.modrinth.com/lithium-0.14.jar',
    size: lithiumJar.length,
    sha1: lithiumHashes.sha1,
    sha512: lithiumHashes.sha512,
  },
  dependencies: [],
  ...over,
})

const sodiumVersions = [
  // The version a list from an older instance points at, and the one that fits here.
  version({
    id: 'SOD-OLD',
    projectId: sodium.id,
    name: 'Sodium 0.5',
    versionNumber: '0.5',
    gameVersions: ['1.20.1'],
    file: { name: 'sodium-0.5.jar', url: 'https://cdn.modrinth.com/sodium-0.5.jar', size: 10 },
  }),
  version({
    id: 'SOD-NEW',
    projectId: sodium.id,
    name: 'Sodium 0.6',
    versionNumber: '0.6',
    publishedAt: '2026-02-01T00:00:00Z',
    file: { name: 'sodium-0.6.jar', url: 'https://cdn.modrinth.com/sodium-0.6.jar', size: 10 },
  }),
]

/** A Fabric 1.21.4 Prism instance holding `jars`, with Lithium and Sodium on a fake Modrinth. */
async function setup(jars: Record<string, Uint8Array> = {}) {
  const f = await copyFixture('prism')
  const mods = path.join(f.dir, 'minecraft/mods')
  for (const [name, bytes] of Object.entries(jars)) await Bun.write(path.join(mods, name), bytes)
  const fake = fakeModrinth({
    matches: {
      [lithiumHashes.sha1]: {
        projectId: lithium.id,
        versionId: 'LITH1',
        versionNumber: '0.14',
        loaders: ['fabric'],
        gameVersions: ['1.21.4'],
      },
    },
    projects: [lithium, sodium],
    versions: [version(), ...sodiumVersions],
  })
  const token = createSessionToken()
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: makeServices({
      instance: await InstanceService.load(f.dir),
      modrinth: fake.modrinth,
      now: () => Date.UTC(2026, 8, 23, 10),
    }),
    web: { dir: path.join(f.dir, 'no-web') },
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
  return {
    dir: f.dir,
    request,
    exportList: async (): Promise<ModList> => {
      const res = await request('GET', '/api/share/export')
      expect(res.status).toBe(200)
      return api.share.exportList.response.parse(await res.json())
    },
    importPlan: async (list: unknown) => {
      const res = await request('POST', '/api/share/import', { list })
      expect(res.status).toBe(200)
      return api.share.importPlan.response.parse(await res.json())
    },
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

/** A list made "elsewhere": Lithium from Modrinth, Sodium pinned to a 1.20.1 build, one local jar. */
const sharedList: ModList = {
  format: MOD_LIST_FORMAT,
  formatVersion: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  generator: { name: 'mc-mod', version: '1.0.0' },
  instance: {
    kind: 'client',
    contentKind: 'mod',
    gameVersion: '1.20.1',
    loader: 'fabric',
    loaderVersion: '0.15.0',
    javaVersion: { major: 17, source: 'detected' },
  },
  mods: [
    {
      fileName: 'lithium-0.14.jar',
      name: 'Lithium',
      version: '0.14',
      enabled: true,
      side: 'both',
      size: lithiumJar.length,
      sha1: lithiumHashes.sha1,
      source: { provider: 'modrinth', projectId: lithium.id, versionId: 'LITH1', title: 'Lithium' },
    },
    {
      fileName: 'sodium-0.5.jar',
      name: 'Sodium',
      version: '0.5',
      enabled: false,
      side: 'client',
      size: 10,
      source: { provider: 'modrinth', projectId: sodium.id, versionId: 'SOD-OLD', title: 'Sodium' },
    },
    {
      fileName: 'homemade-0.1.jar',
      name: 'Homemade',
      version: '0.1',
      enabled: true,
      side: 'unknown',
      size: localJar.length,
    },
  ],
}

test('the exported list describes the instance and every jar', async () => {
  await using t = await setup({ 'lithium-0.14.jar': lithiumJar, 'mine.jar.disabled': localJar })
  const list = await t.exportList()

  expect(list.format).toBe(MOD_LIST_FORMAT)
  expect(list.createdAt).toBe('2026-09-23T10:00:00.000Z')
  expect(list.generator).toEqual({ name: 'mc-mod', version: '1.0.0-test' })
  expect(list.instance).toEqual({
    kind: 'client',
    contentKind: 'mod',
    gameVersion: '1.21.4',
    loader: 'fabric',
    loaderVersion: '0.16.9',
    javaVersion: { major: 21, source: 'detected' },
  })

  const identified = list.mods.find((m) => m.fileName === 'lithium-0.14.jar')
  expect(identified).toMatchObject({
    name: 'Lithium',
    version: '0.14',
    enabled: true,
    sha1: lithiumHashes.sha1,
    source: { provider: 'modrinth', projectId: lithium.id, versionId: 'LITH1' },
  })
  // Disabled jars are listed under their enabled name, with `enabled: false` and no source.
  const local = list.mods.find((m) => m.name === 'Homemade')
  expect(local).toMatchObject({ fileName: 'mine.jar', enabled: false, version: '0.1' })
  expect(local?.source).toBeUndefined()
})

test('an exported list imports into the same instance as all installed', async () => {
  await using t = await setup({ 'lithium-0.14.jar': lithiumJar })
  const plan = await t.importPlan(await t.exportList())

  expect(plan.checks.every((c) => c.match === 'same')).toBe(true)
  expect(plan.items.map((i) => i.status)).toEqual(['installed'])
  expect(plan.items[0]?.reason).toBe('Installed as lithium-0.14.jar')
  expect(plan.warnings).toEqual([])
})

test("someone else's list: versions are re-picked, local jars and mismatches are flagged", async () => {
  await using t = await setup()
  const plan = await t.importPlan(sharedList)

  expect(plan.from.gameVersion).toBe('1.20.1')
  expect(plan.to.gameVersion).toBe('1.21.4')
  expect(plan.checks).toEqual([
    { label: 'game version', theirs: '1.20.1', ours: '1.21.4', match: 'differs' },
    { label: 'loader', theirs: 'Fabric', ours: 'Fabric', match: 'same' },
    { label: 'loader version', theirs: '0.15.0', ours: '0.16.9', match: 'differs' },
    { label: 'Java', theirs: 'Java 17', ours: 'Java 21', match: 'differs' },
  ])

  const [lith, sod, local] = plan.items
  expect(lith).toMatchObject({ status: 'install', versionId: 'LITH1', versionNumber: '0.14' })
  // The listed Sodium is a 1.20.1 build, so the 1.21.4 one takes its place.
  expect(sod).toMatchObject({
    status: 'install',
    listedVersion: '0.5',
    versionId: 'SOD-NEW',
    versionNumber: '0.6',
    enabled: false,
  })
  expect(sod?.note).toContain("doesn't fit")
  expect(local).toMatchObject({ status: 'local', title: 'Homemade' })
  expect(plan.warnings.join(' ')).toContain('game version 1.20.1')
  expect(plan.warnings.join(' ')).toContain('Modrinth or CurseForge')
})

test('a project with no fitting version is unavailable; CurseForge needs a key', async () => {
  await using t = await setup()
  const plan = await t.importPlan({
    ...sharedList,
    mods: [
      {
        ...sharedList.mods[0],
        fileName: 'gone-1.0.jar',
        name: 'Gone',
        source: { provider: 'modrinth', projectId: 'NOSUCHID' },
        sha1: undefined,
      },
      {
        ...sharedList.mods[1],
        fileName: 'cf-1.0.jar',
        name: 'CF mod',
        source: { provider: 'curseforge', projectId: '12345' },
      },
    ],
  })
  expect(plan.items.map((i) => i.status)).toEqual(['unavailable', 'unavailable'])
  expect(plan.items[0]?.reason).toContain('No version for Fabric 1.21.4')
  expect(plan.items[1]?.reason).toContain('CurseForge API key')
  expect(plan.warnings.join(' ')).toContain('CurseForge API key')
})

test('rejects files that are not mod lists, and lists from a newer mc-mod', async () => {
  await using t = await setup()
  const bad = await t.request('POST', '/api/share/import', { list: { hello: 'world' } })
  expect(bad.status).toBe(400)

  const newer = await t.request('POST', '/api/share/import', {
    list: { ...sharedList, formatVersion: 2 },
  })
  expect(newer.status).toBe(400)
  expect(await newer.text()).toContain('newer mc-mod')
})
