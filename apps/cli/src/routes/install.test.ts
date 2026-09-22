import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  api,
  type JobEvent,
  JobEvent as JobEventSchema,
  type ProjectVersion,
  TOKEN_HEADER,
} from '@mc-mod/shared'
import { fakeCurseForge } from '../../test/fake-curseforge'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeJar } from '../../test/jar'
import { makeServices } from '../../test/services'
import { readState } from '../instance/state'
import { hashBytes } from '../jar/hash'
import type { ProjectInfo } from '../providers/types'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

const jar = makeJar({
  'fabric.mod.json': JSON.stringify({ id: 'lithium', name: 'Lithium', version: '0.14' }),
})
const hashes = hashBytes(jar)
const lithium: ProjectInfo = {
  id: 'gvQqBUqZ',
  slug: 'lithium',
  title: 'Lithium',
  description: '',
  iconUrl: 'https://cdn.modrinth.com/icon.png',
  side: 'both',
}
const file = {
  name: 'lithium-0.14.jar',
  url: 'https://cdn.modrinth.com/data/gvQqBUqZ/lithium-0.14.jar',
  size: jar.length,
  sha1: hashes.sha1,
  sha512: hashes.sha512,
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
  file,
  dependencies: [],
  ...over,
})

async function setup(
  versions: ProjectVersion[] = [version()],
  curseforge?: ReturnType<typeof fakeCurseForge>['curseforge'],
) {
  const f = await copyFixture('prism')
  const fake = fakeModrinth({ projects: [lithium], versions })
  const downloads: string[] = []
  const services = makeServices({
    instance: await InstanceService.load(f.dir),
    modrinth: fake.modrinth,
    now: () => 1000,
    curseforge,
    fetch: async (url) => {
      downloads.push(url)
      return new Response(jar)
    },
  })
  const token = createSessionToken()
  const { app } = createApp({
    auth: { mode: 'token', token },
    services,
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

  /** Starts an install and collects its events until `done`. */
  const install = async (
    items: { versionId: string; provider?: string; projectId?: string }[],
  ): Promise<JobEvent[]> => {
    const res = await request('POST', '/api/install', {
      items: items.map((i) => ({ provider: 'modrinth', projectId: lithium.id, ...i })),
    })
    const { jobId } = api.install.install.response.parse(await res.json())
    const stream = await request('GET', `/api/jobs/${jobId}/events`)
    expect(stream.headers.get('content-type')).toStartWith('text/event-stream')
    const text = await stream.text()
    return text
      .split('\n\n')
      .filter((b) => b.startsWith('data: '))
      .map((b) => JobEventSchema.parse(JSON.parse(b.slice('data: '.length))))
  }

  return {
    dir: f.dir,
    mods: path.join(f.dir, 'minecraft/mods'),
    downloads,
    request,
    install,
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('installs, records the source and streams the events', async () => {
  await using t = await setup()
  const events = await t.install([{ versionId: 'LITH1' }])
  expect(events.at(-2)).toEqual({
    type: 'item-done',
    index: 0,
    fileName: 'lithium-0.14.jar',
    skipped: false,
  })
  expect(events.at(-1)).toEqual({ type: 'done', installed: 1, failed: 0 })
  expect(events.some((e) => e.type === 'progress')).toBe(true)
  expect(t.downloads).toEqual(['https://cdn.modrinth.com/data/gvQqBUqZ/lithium-0.14.jar'])
  expect(hashBytes(await Bun.file(path.join(t.mods, 'lithium-0.14.jar')).bytes()).sha1).toBe(
    hashes.sha1,
  )
  // Nothing is left behind in the temp dir.
  expect(await readdir(path.join(t.dir, '.mc-mod/tmp'))).toEqual([])

  const { state } = await readState(t.dir)
  expect(state.mods?.[hashes.sha1]?.sources?.[0]).toMatchObject({
    projectId: lithium.id,
    versionId: 'LITH1',
    title: 'Lithium',
    method: 'install-record',
  })

  const list = api.mods.list.response.parse(await (await t.request('GET', '/api/mods')).json())
  expect(list.mods.find((m) => m.fileName === 'lithium-0.14.jar')?.sources[0]?.method).toBe(
    'install-record',
  )
})

test('the same file again is skipped; a different one is a conflict', async () => {
  await using t = await setup()
  await t.install([{ versionId: 'LITH1' }])
  const again = await t.install([{ versionId: 'LITH1' }])
  expect(again.at(-2)).toMatchObject({ type: 'item-done', skipped: true })
  expect(t.downloads).toHaveLength(1)

  await Bun.write(path.join(t.mods, 'lithium-0.14.jar'), 'other bytes')
  const conflict = await t.install([{ versionId: 'LITH1' }])
  expect(conflict.at(-2)).toMatchObject({ type: 'item-failed', code: 'CONFLICT' })
  expect(conflict.at(-1)).toEqual({ type: 'done', installed: 0, failed: 1 })
  expect(await Bun.file(path.join(t.mods, 'lithium-0.14.jar')).text()).toBe('other bytes')
})

test('a hash mismatch fails the item and leaves nothing behind', async () => {
  const bad = version({ file: { ...file, sha512: '0'.repeat(128), sha1: undefined } })
  await using t = await setup([bad])
  const events = await t.install([{ versionId: 'LITH1' }])
  expect(events.at(-2)).toMatchObject({ type: 'item-failed', code: 'HASH_MISMATCH' })
  expect(await readdir(t.mods)).not.toContain('lithium-0.14.jar')
  expect(await readdir(path.join(t.dir, '.mc-mod/tmp'))).toEqual([])
})

test('unknown versions and jobs are 404s', async () => {
  await using t = await setup()
  const res = await t.request('POST', '/api/install', {
    items: [{ provider: 'modrinth', projectId: lithium.id, versionId: 'NOPE' }],
  })
  expect(res.status).toBe(404)
  const job = await t.request('GET', `/api/jobs/${crypto.randomUUID()}/events`)
  expect(job.status).toBe(404)
  expect((await t.request('GET', '/api/jobs/not-a-uuid/events')).status).toBe(400)
})

test('installs from CurseForge (sha1 only) and fails manual-only files cleanly', async () => {
  const cfFile = (id: string, url: string | null): ProjectVersion => ({
    ...version(),
    provider: 'curseforge',
    id,
    projectId: '394468',
    file: {
      name: `cf-${id}.jar`,
      url: url && 'https://edge.forgecdn.net/files/5/1/cf.jar',
      size: jar.length,
      sha1: hashes.sha1,
    },
    pageUrl: `https://www.curseforge.com/minecraft/mc-mods/lithium/files/${id}`,
  })
  const cf = fakeCurseForge({
    projects: [{ ...lithium, id: '394468' }],
    versions: [cfFile('51', 'yes'), cfFile('52', null)],
  })
  await using t = await setup([], cf.curseforge)
  const events = await t.install([
    { provider: 'curseforge', projectId: '394468', versionId: '51' },
    { provider: 'curseforge', projectId: '394468', versionId: '52' },
  ])
  expect(events.filter((e) => e.type !== 'progress')).toEqual([
    { type: 'item-done', index: 0, fileName: 'cf-51.jar', skipped: false },
    {
      type: 'item-failed',
      index: 1,
      code: 'MANUAL_DOWNLOAD_REQUIRED',
      message: 'The author only allows downloading cf-52.jar from the CurseForge website',
    },
    { type: 'done', installed: 1, failed: 1 },
  ])
  expect(t.downloads).toEqual(['https://edge.forgecdn.net/files/5/1/cf.jar'])
  const { state } = await readState(t.dir)
  expect(state.mods?.[hashes.sha1]?.sources?.[0]).toMatchObject({
    provider: 'curseforge',
    projectId: '394468',
    versionId: '51',
    method: 'install-record',
  })
})
