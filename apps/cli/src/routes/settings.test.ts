import { expect, test } from 'bun:test'
import path from 'node:path'
import { api, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeServices } from '../../test/services'
import { ConfigService } from '../config'
import { CurseForgeProvider } from '../providers/curseforge'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

async function setup() {
  const f = await copyFixture('prism')
  const config = new ConfigService(path.join(f.dir, 'global', 'config.json'))
  const keys: string[] = []
  const curseforge = new CurseForgeProvider(
    () => config.curseforgeKey(),
    async (_url, init) => {
      const key = new Headers(init?.headers).get('x-api-key') ?? ''
      keys.push(key)
      return new Response('{}', { status: key === 'good-key' ? 200 : 403 })
    },
  )
  const services = makeServices({
    instance: await InstanceService.load(f.dir),
    modrinth: fakeModrinth().modrinth,
    config,
    curseforge,
  })
  const token = createSessionToken()
  const { app } = createApp({
    auth: { mode: 'token', token },
    services,
    webDir: path.join(f.dir, 'no-web'),
    validateResponses: true,
  })
  const s = await listen(app)
  const request = (method: string, p: string, body?: unknown) =>
    fetch(`${s.url}${p}`, {
      method,
      headers: { [TOKEN_HEADER]: token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return {
    config,
    keys,
    request,
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('PUT saves settings; the key is write-only', async () => {
  await using t = await setup()
  const before = api.settings.get.response.parse(
    await (await t.request('GET', '/api/settings')).json(),
  )
  expect(before.curseforgeKeySet).toBe(false)

  const res = await t.request('PUT', '/api/settings', {
    curseforgeApiKey: 'good-key',
    exportDirName: 'to-upload',
  })
  const text = await res.text()
  expect(text).not.toContain('good-key')
  expect(api.settings.update.response.parse(JSON.parse(text))).toMatchObject({
    curseforgeKeySet: true,
    exportDirName: 'to-upload',
  })
  expect(t.config.curseforgeKey()).toBe('good-key')
})

test('PUT rejects a bad export folder name', async () => {
  await using t = await setup()
  const res = await t.request('PUT', '/api/settings', { exportDirName: '../outside' })
  expect(res.status).toBe(400)
})

test('test-curseforge checks the given key, or the saved one', async () => {
  await using t = await setup()
  const post = async (body: object) =>
    api.settings.testCurseforge.response.parse(
      await (await t.request('POST', '/api/settings/test-curseforge', body)).json(),
    )
  expect(await post({})).toEqual({ ok: false, message: 'No API key is set.' })
  expect((await post({ apiKey: 'bad-key' })).ok).toBe(false)
  await t.config.update({ curseforgeApiKey: 'good-key' })
  expect(await post({})).toEqual({ ok: true, message: 'The key works.' })
  expect(t.keys).toEqual(['bad-key', 'good-key'])
})
