import { expect, test } from 'bun:test'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { copyFixture } from '../test/fixtures'
import { ConfigService } from './config'

async function tempConfig() {
  const f = await copyFixture('empty')
  return { ...f, file: path.join(f.dir, 'config', 'config.json') }
}

test('a missing file gives defaults', async () => {
  await using t = await tempConfig()
  const c = await ConfigService.load(t.file)
  expect(c.settings()).toEqual({
    curseforgeKeySet: false,
    curseforgeKeySource: null,
    preferredProvider: 'modrinth',
    allowPrerelease: false,
    exportDirName: 'server-mods',
    configPath: t.file,
  })
  expect(c.warning).toBeUndefined()
})

test('update saves the file (0600) and reloads; null removes the key', async () => {
  await using t = await tempConfig()
  const c = await ConfigService.load(t.file)
  const s = await c.update({ curseforgeApiKey: 'abc$123', allowPrerelease: true })
  expect(s).toMatchObject({ curseforgeKeySet: true, curseforgeKeySource: 'config' })
  expect(JSON.stringify(s)).not.toContain('abc$123')
  if (process.platform !== 'win32') expect((await stat(t.file)).mode & 0o777).toBe(0o600)

  const again = await ConfigService.load(t.file)
  expect(again.curseforgeKey()).toBe('abc$123')
  expect(again.config.allowPrerelease).toBe(true)
  await again.update({ curseforgeApiKey: null })
  expect((await ConfigService.load(t.file)).curseforgeKey()).toBeUndefined()
})

test('the env key wins over the saved one', async () => {
  await using t = await tempConfig()
  const c = await ConfigService.load(t.file, 'from-env')
  await c.update({ curseforgeApiKey: 'saved' })
  expect(c.curseforgeKey()).toBe('from-env')
  expect(c.settings().curseforgeKeySource).toBe('env')
})

test('bad values fall back to defaults and unknown fields survive a save', async () => {
  await using t = await tempConfig()
  await Bun.write(
    t.file,
    JSON.stringify({
      schemaVersion: 1,
      preferredProvider: 'nope',
      exportDirName: '../x',
      future: 1,
    }),
  )
  const c = await ConfigService.load(t.file)
  expect(c.config).toMatchObject({ preferredProvider: 'modrinth', exportDirName: 'server-mods' })
  await c.update({ preferredProvider: 'curseforge' })
  expect(await Bun.file(t.file).json()).toMatchObject({
    future: 1,
    preferredProvider: 'curseforge',
  })
})

test('an unreadable file is kept as .broken and defaults are used', async () => {
  await using t = await tempConfig()
  await Bun.write(t.file, '{nope')
  const c = await ConfigService.load(t.file)
  expect(c.warning).toContain('config.json.broken')
  expect(await Bun.file(`${t.file}.broken`).text()).toBe('{nope')
})
