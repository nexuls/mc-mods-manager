import { expect, test } from 'bun:test'
import path from 'node:path'
import { ApiErrorSchema, api, TOKEN_HEADER } from '@mc-mod/shared'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { listen } from '../../test/http'
import { makeServices } from '../../test/services'
import { stateFile } from '../instance/state'
import { createSessionToken } from '../security'
import { createApp } from '../server'
import { InstanceService } from '../services/instance'

async function setup(fixture: string) {
  const f = await copyFixture(fixture)
  const token = createSessionToken()
  const instance = await InstanceService.load(f.dir)
  const { app } = createApp({
    auth: { mode: 'token', token },
    services: makeServices({ instance, modrinth: fakeModrinth().modrinth }),
    webDir: path.join(f.dir, 'no-web'),
    validateResponses: true,
  })
  const s = await listen(app)
  const request = (method: string, body?: unknown) =>
    fetch(`${s.url}/api/instance`, {
      method,
      headers: { [TOKEN_HEADER]: token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return {
    dir: f.dir,
    request,
    [Symbol.asyncDispose]: async () => {
      await s[Symbol.asyncDispose]()
      await f[Symbol.asyncDispose]()
    },
  }
}

test('GET returns the detected instance', async () => {
  await using t = await setup('prism')
  const body = api.instance.get.response.parse(await (await t.request('GET')).json())
  expect(body.needsSetup).toBe(false)
  expect(body.instance).toMatchObject({ loader: 'fabric', gameVersion: '1.21.4' })
})

test('PUT saves overrides to state.json and they survive a reload', async () => {
  await using t = await setup('empty')
  const before = api.instance.get.response.parse(await (await t.request('GET')).json())
  expect(before.needsSetup).toBe(true)

  const res = await t.request('PUT', { gameVersion: '1.21.1', loader: 'neoforge' })
  expect(res.status).toBe(200)
  const after = api.instance.update.response.parse(await res.json())
  expect(after).toMatchObject({ needsSetup: false, instance: { loader: 'neoforge' } })

  expect(await Bun.file(stateFile(t.dir)).json()).toEqual({
    schemaVersion: 1,
    instance: { gameVersion: '1.21.1', loader: 'neoforge' },
  })
  expect((await InstanceService.load(t.dir)).instance.gameVersion).toBe('1.21.1')
})

test('PUT rejects bad input without writing state', async () => {
  await using t = await setup('empty')
  for (const body of [{ loader: 'nope' }, { gameVersion: '1.21/..' }, { contentDir: '../out' }]) {
    const res = await t.request('PUT', body)
    expect(res.status).toBe(400)
    expect(ApiErrorSchema.parse(await res.json()).error.code).toBe('BAD_REQUEST')
  }
  expect(await Bun.file(stateFile(t.dir)).exists()).toBe(false)
})
