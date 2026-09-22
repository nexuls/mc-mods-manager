import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { ApiErrorSchema, api, TOKEN_HEADER } from '@mc-mod/shared'
import { unzipSync } from 'fflate'
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

const fabricJar = (id: string, environment?: string) =>
  makeJar({ 'fabric.mod.json': JSON.stringify({ id, name: id, version: '1.0', environment }) })

const sodiumJar = fabricJar('sodium', 'client')
const jars: Record<string, Uint8Array> = {
  'sodium-0.6.0.jar': sodiumJar,
  'lithium-1.0.jar': fabricJar('lithium'),
  'ledger-1.0.jar': fabricJar('ledger', 'server'),
  // No metadata at all, so nobody knows its side.
  'mystery.jar': makeJar({ 'readme.txt': 'hi' }),
  'spark-1.0.jar.disabled': fabricJar('spark', 'server'),
}

const sodium: ProjectInfo = {
  id: 'AANobbMI',
  slug: 'sodium',
  title: 'Sodium',
  description: 'Fast',
  side: 'client',
}

/** A Prism instance (Fabric 1.21.4) with one jar per export group, or another fixture. */
async function setup(fixture = 'prism') {
  const f = await copyFixture(fixture)
  const mods = path.join(f.dir, 'minecraft/mods')
  if (fixture === 'prism') {
    for (const [name, bytes] of Object.entries(jars)) await Bun.write(path.join(mods, name), bytes)
  }
  const fake = fakeModrinth({
    matches: {
      [hashBytes(sodiumJar).sha1]: {
        projectId: sodium.id,
        versionId: 'V1',
        versionNumber: '0.6.0',
        loaders: ['fabric'],
        gameVersions: ['1.21.4'],
      },
    },
    projects: [sodium],
  })
  const opened: string[] = []
  const token = createSessionToken()
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: makeServices({
      instance: await InstanceService.load(f.dir),
      modrinth: fake.modrinth,
      now: () => new Date(2026, 8, 22, 12).getTime(),
      openFolder: async (dir) => {
        opened.push(dir)
        return true
      },
    }),
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
  return {
    dir: f.dir,
    mods,
    opened,
    request,
    preview: async (query = '') =>
      api.export.preview.response.parse(
        await (await request('GET', `/api/export/preview${query}`)).json(),
      ),
    run: async (body: object) => {
      const res = await request('POST', '/api/export', body)
      expect(res.status).toBe(200)
      return api.export.run.response.parse(await res.json())
    },
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

const names = (mods: { fileName: string }[]) => mods.map((m) => m.fileName).sort()
/** The mods folder's jars (the fixture also has a `.gitkeep`). */
const jarsIn = async (dir: string) => (await readdir(dir)).filter((f) => f.includes('.jar')).sort()

test('preview groups mods by side; disabled ones are excluded', async () => {
  await using t = await setup()
  const p = await t.preview()
  expect(p.dir).toBe(path.join(t.dir, 'server-mods'))
  expect(p.dirName).toBe('server-mods')
  expect(p.zipName).toBe('server-mods-1.21.4-2026-09-22.zip')
  expect(names(p.include)).toEqual(['ledger-1.0.jar', 'lithium-1.0.jar'])
  expect(names(p.unknown)).toEqual(['mystery.jar'])
  expect(names(p.exclude)).toEqual(['sodium-0.6.0.jar', 'spark-1.0.jar.disabled'])
  expect(p.existingJars).toEqual([])
})

test('a clean copy replaces earlier jars, keeps other files and leaves mods/ alone', async () => {
  await using t = await setup()
  const out = path.join(t.dir, 'server-mods')
  await Bun.write(path.join(out, 'old-mod.jar'), 'old')
  await Bun.write(path.join(out, 'lithium-1.0.jar'), 'stale bytes')
  await Bun.write(path.join(out, 'README.txt'), 'mine')
  expect((await t.preview()).existingJars).toEqual(['lithium-1.0.jar', 'old-mod.jar'])

  const result = await t.run({ mode: 'copy', clean: true, exclude: ['mystery.jar'] })
  expect(result).toEqual({ mode: 'copy', path: out, count: 2, removed: 1 })
  expect((await readdir(out)).sort()).toEqual(['README.txt', 'ledger-1.0.jar', 'lithium-1.0.jar'])
  expect(Buffer.from(await Bun.file(path.join(out, 'lithium-1.0.jar')).bytes())).toEqual(
    Buffer.from(jars['lithium-1.0.jar'] ?? []),
  )
  expect(await jarsIn(t.mods)).toEqual(Object.keys(jars).sort())
})

test('a copy without clean keeps earlier jars', async () => {
  await using t = await setup()
  await Bun.write(path.join(t.dir, 'server-mods/old-mod.jar'), 'old')
  const result = await t.run({ mode: 'copy', clean: false })
  expect(result).toMatchObject({ count: 3, removed: 0 })
  expect((await readdir(path.join(t.dir, 'server-mods'))).sort()).toEqual([
    'ledger-1.0.jar',
    'lithium-1.0.jar',
    'mystery.jar',
    'old-mod.jar',
  ])
})

test('another folder name', async () => {
  await using t = await setup()
  expect((await t.preview('?dirName=upload')).dir).toBe(path.join(t.dir, 'upload'))
  const result = await t.run({ mode: 'copy', clean: true, dirName: 'upload' })
  expect(result.path).toBe(path.join(t.dir, 'upload'))
  expect(await readdir(path.join(t.dir, 'upload'))).toHaveLength(3)
})

test('zip stores the jars in one file in the instance root', async () => {
  await using t = await setup()
  const result = await t.run({ mode: 'zip', clean: false, exclude: ['ledger-1.0.jar'] })
  const zip = path.join(t.dir, 'server-mods-1.21.4-2026-09-22.zip')
  expect(result).toEqual({ mode: 'zip', path: zip, count: 2, removed: 0 })
  const entries = unzipSync(await Bun.file(zip).bytes())
  expect(Object.keys(entries).sort()).toEqual(['lithium-1.0.jar', 'mystery.jar'])
  expect(Buffer.from(entries['mystery.jar'] ?? [])).toEqual(Buffer.from(jars['mystery.jar'] ?? []))
})

test('refuses folders that are or hold the mods folder, and unsafe names', async () => {
  await using t = await setup()
  for (const dirName of ['minecraft', '../elsewhere', '.hidden', 'a/b']) {
    const res = await t.request('POST', '/api/export', { mode: 'copy', clean: true, dirName })
    expect(res.status).toBe(400)
  }
  expect(await jarsIn(t.mods)).toEqual(Object.keys(jars).sort())
})

test('plugin instances have nothing to export', async () => {
  await using t = await setup('paper-server')
  const res = await t.request('GET', '/api/export/preview')
  expect(res.status).toBe(400)
  expect(ApiErrorSchema.parse(await res.json()).error.message).toContain('Plugins')
})

test('reveal opens the folder once it exists', async () => {
  await using t = await setup()
  const before = await t.request('POST', '/api/export/reveal', { mode: 'copy' })
  expect(before.status).toBe(404)
  expect(t.opened).toEqual([])

  await t.run({ mode: 'copy', clean: true })
  const res = await t.request('POST', '/api/export/reveal', { mode: 'copy' })
  expect(await res.json()).toEqual({ opened: true, path: path.join(t.dir, 'server-mods') })
  const zip = await t.request('POST', '/api/export/reveal', { mode: 'zip' })
  expect(await zip.json()).toEqual({ opened: true, path: t.dir })
  expect(t.opened).toEqual([path.join(t.dir, 'server-mods'), t.dir])
})
