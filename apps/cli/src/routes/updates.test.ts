import { expect, test } from 'bun:test'
import { readdir, rename } from 'node:fs/promises'
import path from 'node:path'
import {
  api,
  type JobEvent,
  JobEvent as JobEventSchema,
  type ProjectVersion,
  TOKEN_HEADER,
} from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeJar } from '../../test/jar'
import { makeServices } from '../../test/services'
import { readState, updateState } from '../instance/state'
import { hashBytes } from '../jar/hash'
import type { ProjectInfo } from '../providers/types'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

const meta = (version: string) =>
  JSON.stringify({ id: 'lithium', name: 'Lithium', version, environment: '*' })
const oldJar = makeJar({ 'fabric.mod.json': meta('0.14') })
const newJar = makeJar({ 'fabric.mod.json': meta('0.15') })
const oldHash = hashBytes(oldJar)
const newHash = hashBytes(newJar)

const lithium: ProjectInfo = {
  id: 'gvQqBUqZ',
  slug: 'lithium',
  title: 'Lithium',
  description: '',
  side: 'both',
}

const version = (over: Partial<ProjectVersion>): ProjectVersion => ({
  provider: 'modrinth',
  id: 'LITH1',
  projectId: lithium.id,
  name: 'Lithium',
  versionNumber: '0.14',
  type: 'release',
  publishedAt: '2026-01-01T00:00:00Z',
  downloads: 0,
  loaders: ['fabric'],
  gameVersions: ['1.21.4'],
  file: null,
  dependencies: [],
  ...over,
})

const v1 = version({
  file: {
    name: 'lithium-0.14.jar',
    url: 'https://cdn.modrinth.com/data/gvQqBUqZ/lithium-0.14.jar',
    size: oldJar.length,
    sha1: oldHash.sha1,
    sha512: oldHash.sha512,
  },
})

const v2 = (name = 'lithium-0.15.jar') =>
  version({
    id: 'LITH2',
    versionNumber: '0.15',
    publishedAt: '2026-02-01T00:00:00Z',
    file: {
      name,
      url: `https://cdn.modrinth.com/data/gvQqBUqZ/${name}`,
      size: newJar.length,
      sha1: newHash.sha1,
      sha512: newHash.sha512,
    },
  })

/** The jars in a folder, sorted. */
const jars = async (dir: string) =>
  (await readdir(dir)).filter((n) => /\.jar(\.disabled)?$/.test(n)).sort()

/** Prism (Fabric 1.21.4) with Lithium 0.14 installed as `fileName`; Modrinth also has 0.15. */
async function setup(options: { fileName?: string; newName?: string } = {}) {
  const f = await copyFixture('prism')
  const mods = path.join(f.dir, 'minecraft/mods')
  const fileName = options.fileName ?? 'lithium-0.14.jar'
  await Bun.write(path.join(mods, fileName), oldJar)
  const fake = fakeModrinth({
    projects: [lithium],
    versions: [v2(options.newName), v1],
    matches: {
      [oldHash.sha1]: {
        projectId: lithium.id,
        versionId: 'LITH1',
        versionNumber: '0.14',
        loaders: ['fabric'],
        gameVersions: ['1.21.4'],
      },
    },
  })
  const downloads: string[] = []
  const services = makeServices({
    instance: await InstanceService.load(f.dir),
    modrinth: fake.modrinth,
    now: () => 1000,
    fetch: async (url) => {
      downloads.push(url)
      return new Response(url.endsWith('0.14.jar') ? oldJar : newJar)
    },
  })
  const token = createSessionToken()
  const { app } = createApp({
    auth: { mode: 'token', token },
    services,
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
  const events = async (jobId: string): Promise<JobEvent[]> => {
    const text = await (await request('GET', `/api/jobs/${jobId}/events`)).text()
    return text
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JobEventSchema.parse(JSON.parse(b.slice('data: '.length))))
  }
  const check = async () =>
    api.mods.checkUpdates.response.parse(
      await (await request('POST', '/api/mods/check-updates')).json(),
    )
  return {
    dir: f.dir,
    mods,
    downloads,
    request,
    events,
    check,
    async [Symbol.asyncDispose]() {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('check-updates finds the newer version, and later lists keep it', async () => {
  await using t = await setup()
  const { mods, warnings } = await t.check()
  expect(warnings).toEqual([])
  expect(mods[0]?.update).toMatchObject({
    versionId: 'LITH2',
    versionNumber: '0.15',
    fileName: 'lithium-0.15.jar',
    manual: false,
  })
  const list = api.mods.list.response.parse(await (await t.request('GET', '/api/mods')).json())
  expect(list.mods[0]?.update?.versionId).toBe('LITH2')
})

test('update-all replaces the jar and moves the old one to the trash', async () => {
  await using t = await setup()
  await t.check()
  const res = await t.request('POST', '/api/mods/update-all', {})
  expect(res.status).toBe(200)
  const { jobId, items } = api.mods.updateAll.response.parse(await res.json())
  expect(items).toEqual([
    { fileName: 'lithium-0.14.jar', title: 'Lithium', fromVersion: '0.14', toVersion: '0.15' },
  ])
  expect((await t.events(jobId)).at(-1)).toEqual({ type: 'done', installed: 1, failed: 0 })

  expect(await jars(t.mods)).toEqual(['lithium-0.15.jar'])
  expect(await readdir(path.join(t.dir, '.mc-mod/trash'))).toEqual(['1000-lithium-0.14.jar'])
  const { state } = await readState(t.dir)
  expect(state.mods?.[newHash.sha1]?.sources?.[0]).toMatchObject({
    method: 'install-record',
    versionId: 'LITH2',
  })

  // Up to date now: nothing left to update.
  const { mods } = await t.check()
  expect(mods.map((m) => [m.fileName, m.update])).toEqual([['lithium-0.15.jar', undefined]])
  expect((await t.request('POST', '/api/mods/update-all', {})).status).toBe(409)
})

test('a disabled jar stays disabled, and its side override carries over', async () => {
  await using t = await setup({ fileName: 'lithium-0.14.jar.disabled' })
  await updateState(t.dir, (s) => ({ ...s, mods: { [oldHash.sha1]: { sideOverride: 'client' } } }))
  const res = await t.request('POST', '/api/mods/lithium-0.14.jar.disabled/update', {})
  const { jobId } = api.mods.updateOne.response.parse(await res.json())
  expect(await t.events(jobId)).toContainEqual({
    type: 'item-done',
    index: 0,
    fileName: 'lithium-0.15.jar.disabled',
    skipped: false,
  })
  expect(await jars(t.mods)).toEqual(['lithium-0.15.jar.disabled'])
  const { state } = await readState(t.dir)
  expect(state.mods?.[newHash.sha1]?.sideOverride).toBe('client')
})

test('a new version with the same file name replaces the old jar in place', async () => {
  await using t = await setup({ fileName: 'lithium.jar', newName: 'lithium.jar' })
  const res = await t.request('POST', '/api/mods/lithium.jar/update', {})
  const { jobId } = api.mods.updateOne.response.parse(await res.json())
  expect((await t.events(jobId)).at(-1)).toEqual({ type: 'done', installed: 1, failed: 0 })
  expect(hashBytes(await Bun.file(path.join(t.mods, 'lithium.jar')).bytes()).sha1).toBe(
    newHash.sha1,
  )
  expect(await readdir(path.join(t.dir, '.mc-mod/trash'))).toEqual(['1000-lithium.jar'])
})

test('change version: any version of the project, but not the installed one', async () => {
  await using t = await setup()
  // Start from 0.15 by updating, then go back to 0.14.
  const up = api.mods.updateOne.response.parse(
    await (await t.request('POST', '/api/mods/lithium-0.14.jar/update', {})).json(),
  )
  await t.events(up.jobId)
  const same = await t.request('POST', '/api/mods/lithium-0.15.jar/update', { versionId: 'LITH2' })
  expect(same.status).toBe(409)
  const down = await t.request('POST', '/api/mods/lithium-0.15.jar/update', { versionId: 'LITH1' })
  const { jobId, items } = api.mods.updateOne.response.parse(await down.json())
  expect(items[0]).toMatchObject({ fromVersion: '0.15', toVersion: '0.14' })
  expect((await t.events(jobId)).at(-1)).toEqual({ type: 'done', installed: 1, failed: 0 })
  expect(await jars(t.mods)).toEqual(['lithium-0.14.jar'])

  const other = await t.request('POST', '/api/mods/lithium-0.14.jar/update', { versionId: 'NOPE' })
  expect(other.status).toBe(404)
})

test('an up-to-date or unidentified jar has nothing to update to', async () => {
  await using t = await setup()
  await Bun.write(path.join(t.mods, 'local.jar'), makeJar({ 'fabric.mod.json': '{"id":"x"}' }))
  expect((await t.request('POST', '/api/mods/local.jar/update', {})).status).toBe(409)
  await rename(path.join(t.mods, 'lithium-0.14.jar'), path.join(t.dir, 'moved.jar'))
  expect((await t.request('POST', '/api/mods/lithium-0.14.jar/update', {})).status).toBe(404)
})

test('a different file already under the new name is a conflict, and the old jar stays', async () => {
  await using t = await setup()
  await t.check()
  await Bun.write(path.join(t.mods, 'lithium-0.15.jar'), 'something else')
  const { jobId } = api.mods.updateAll.response.parse(
    await (
      await t.request('POST', '/api/mods/update-all', { fileNames: ['lithium-0.14.jar'] })
    ).json(),
  )
  expect(await t.events(jobId)).toContainEqual(
    expect.objectContaining({ type: 'item-failed', code: 'CONFLICT' }),
  )
  expect(await jars(t.mods)).toEqual(['lithium-0.14.jar', 'lithium-0.15.jar'])
  expect(t.downloads).toEqual([])
})
