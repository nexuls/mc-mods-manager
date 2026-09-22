import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { ApiErrorSchema, api, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeJar } from '../../test/jar'
import { makeServices } from '../../test/services'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

const jar = (id: string) =>
  makeJar({ 'fabric.mod.json': JSON.stringify({ id, name: id, version: '1.0' }) })

/** A Prism instance with two jars (one disabled), a clock you can move, and a stray file in the trash. */
async function setup() {
  const f = await copyFixture('prism')
  const mods = path.join(f.dir, 'minecraft/mods')
  const trash = path.join(f.dir, '.mc-mod/trash')
  await Bun.write(path.join(mods, 'alpha-1.0.jar'), jar('alpha'))
  await Bun.write(path.join(mods, 'beta-1.0.jar.disabled'), jar('beta'))
  await Bun.write(path.join(trash, 'notes.txt'), 'not a jar')

  let now = 1_700_000_000_000
  const token = createSessionToken()
  const instance = await InstanceService.load(f.dir)
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: makeServices({ instance, modrinth: fakeModrinth().modrinth, now: () => now }),
    web: { dir: path.join(f.dir, 'no-web') },
    validateResponses: true,
    onInternalError: (err) => {
      throw err
    },
  })
  const s = await listen(app)
  const request = (method: string, p: string) =>
    fetch(`${s.url}${p}`, { method, headers: { [TOKEN_HEADER]: token } })
  return {
    mods,
    trash,
    request,
    tick: () => (now += 1000),
    remove: async (name: string) => {
      const res = await request('DELETE', `/api/mods/${encodeURIComponent(name)}`)
      return api.mods.remove.response.parse(await res.json()).trashId
    },
    list: async () =>
      api.trash.list.response.parse(await (await request('GET', '/api/trash')).json()),
    async [Symbol.asyncDispose]() {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('lists removed jars newest first and ignores other files', async () => {
  await using t = await setup()
  expect(await t.list()).toEqual({ items: [], totalSize: 0 })

  await t.remove('alpha-1.0.jar')
  t.tick()
  await t.remove('beta-1.0.jar.disabled')

  const { items, totalSize } = await t.list()
  expect(items.map((i) => [i.id, i.fileName])).toEqual([
    ['1700000001000-beta-1.0.jar.disabled', 'beta-1.0.jar.disabled'],
    ['1700000000000-alpha-1.0.jar', 'alpha-1.0.jar'],
  ])
  expect(items[1]?.trashedAt).toBe(new Date(1_700_000_000_000).toISOString())
  expect(totalSize).toBe(items.reduce((n, i) => n + i.size, 0))
  expect(totalSize).toBeGreaterThan(0)
})

test('restore puts the jar back under its old name, disabled or not', async () => {
  await using t = await setup()
  const alpha = await t.remove('alpha-1.0.jar')
  const beta = await t.remove('beta-1.0.jar.disabled')

  for (const [id, fileName] of [
    [alpha, 'alpha-1.0.jar'],
    [beta, 'beta-1.0.jar.disabled'],
  ] as const) {
    const res = await t.request('POST', `/api/trash/${id}/restore`)
    expect(api.trash.restore.response.parse(await res.json())).toEqual({ fileName })
  }
  expect(await readdir(t.mods)).toEqual(
    expect.arrayContaining(['alpha-1.0.jar', 'beta-1.0.jar.disabled']),
  )
  expect((await t.list()).items).toEqual([])
})

test('restore refuses to replace the same jar, enabled or disabled', async () => {
  await using t = await setup()
  const id = await t.remove('alpha-1.0.jar')
  await Bun.write(path.join(t.mods, 'alpha-1.0.jar.disabled'), jar('alpha'))

  const res = await t.request('POST', `/api/trash/${id}/restore`)
  expect(res.status).toBe(409)
  expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('CONFLICT')
  expect(await readdir(t.trash)).toContain(id)
})

test('delete one, then empty the rest; stray files stay', async () => {
  await using t = await setup()
  const alpha = await t.remove('alpha-1.0.jar')
  await t.remove('beta-1.0.jar.disabled')

  const one = await t.request('DELETE', `/api/trash/${alpha}`)
  expect(api.trash.remove.response.parse(await one.json())).toEqual({ id: alpha })
  expect((await t.list()).items).toHaveLength(1)

  const { totalSize } = await t.list()
  const all = await t.request('DELETE', '/api/trash')
  expect(api.trash.empty.response.parse(await all.json())).toEqual({
    removed: 1,
    freedBytes: totalSize,
  })
  expect(await readdir(t.trash)).toEqual(['notes.txt'])
})

test('ids are validated and must exist', async () => {
  await using t = await setup()
  expect((await t.request('POST', '/api/trash/1-gone.jar/restore')).status).toBe(404)
  expect((await t.request('DELETE', '/api/trash/1-gone.jar')).status).toBe(404)
  for (const id of ['notes.txt', 'alpha.jar', `1-${encodeURIComponent('../state.jar')}`]) {
    expect((await t.request('DELETE', `/api/trash/${id}`)).status).toBe(400)
  }
})
