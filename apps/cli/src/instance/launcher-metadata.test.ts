import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeJar } from '../../test/jar'
import { scanJars } from '../jar/scan'
import { readLauncherMetadata } from './launcher-metadata'

let root: string
let mods: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mc-mod-launcher-'))
  mods = path.join(root, 'mods')
  await Bun.write(path.join(mods, 'a.jar'), makeJar({ 'a.txt': 'a' }))
  await Bun.write(path.join(mods, 'b.jar.disabled'), makeJar({ 'b.txt': 'b' }))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function read() {
  const { jars } = await scanJars(mods, undefined)
  const bySha = await readLauncherMetadata(root, mods, jars)
  const byName = (name: string) => {
    const jar = jars.find((j) => j.fileName === name)
    return jar ? bySha.get(jar.sha1) : undefined
  }
  return { jars, byName }
}

test('packwiz index with both platforms, checked by hash', async () => {
  const { jars } = await scanJars(mods, undefined)
  const a = jars.find((j) => j.fileName === 'a.jar')
  await Bun.write(
    path.join(mods, '.index/a.pw.toml'),
    `name = "Mod A"
filename = "a.jar"
[download]
hash-format = "sha1"
hash = "${a?.sha1.toUpperCase()}"
[update.modrinth]
mod-id = "MRID"
version = "MRVER"
[update.curseforge]
project-id = 1234
file-id = 5678
`,
  )
  await Bun.write(
    path.join(mods, '.index/b.pw.toml'),
    `name = "Mod B"
filename = "b.jar"
[download]
hash-format = "sha1"
hash = "0000000000000000000000000000000000000000"
[update.modrinth]
mod-id = "OTHER"
`,
  )
  await Bun.write(path.join(mods, '.index/broken.pw.toml'), 'not = [toml')

  const { byName } = await read()
  expect(byName('a.jar')).toEqual([
    {
      provider: 'modrinth',
      projectId: 'MRID',
      versionId: 'MRVER',
      title: 'Mod A',
      method: 'launcher-metadata',
    },
    {
      provider: 'curseforge',
      projectId: '1234',
      versionId: '5678',
      title: 'Mod A',
      method: 'launcher-metadata',
    },
  ])
  // The hash doesn't match: the jar was replaced after packwiz recorded it.
  expect(byName('b.jar.disabled')).toBeUndefined()
})

test('CurseForge app installedAddons, matched by file name and fingerprint', async () => {
  const { jars } = await scanJars(mods, undefined)
  const b = jars.find((j) => j.fileName === 'b.jar.disabled')
  await Bun.write(
    path.join(root, 'minecraftinstance.json'),
    JSON.stringify({
      installedAddons: [
        { addonID: 1, name: 'A', installedFile: { id: 10, fileName: 'a.jar', fileFingerprint: 1 } },
        {
          addonID: 2,
          name: 'B',
          installedFile: { id: 20, fileNameOnDisk: 'b.jar', fileFingerprint: b?.cfFingerprint },
        },
        { addonID: 3, installedFile: null },
      ],
    }),
  )
  const { byName } = await read()
  expect(byName('a.jar')).toBeUndefined()
  expect(byName('b.jar.disabled')).toEqual([
    {
      provider: 'curseforge',
      projectId: '2',
      versionId: '20',
      title: 'B',
      method: 'launcher-metadata',
    },
  ])
})

test('ATLauncher launcher.mods', async () => {
  await Bun.write(
    path.join(root, 'instance.json'),
    JSON.stringify({
      launcher: {
        mods: [
          {
            name: 'A',
            version: '1.0',
            file: 'a.jar',
            modrinthProject: { id: 'MR', slug: 'a', title: 'Mod A' },
            modrinthVersion: { id: 'V', version_number: '1.0.1' },
            curseForgeProjectId: 99,
            curseForgeFileId: null,
          },
          { name: 'Gone', file: 'gone.jar', curseForgeProjectId: 1 },
        ],
      },
    }),
  )
  const { byName } = await read()
  expect(byName('a.jar')).toEqual([
    {
      provider: 'modrinth',
      projectId: 'MR',
      versionId: 'V',
      versionNumber: '1.0.1',
      slug: 'a',
      title: 'Mod A',
      method: 'launcher-metadata',
    },
    {
      provider: 'curseforge',
      projectId: '99',
      versionId: undefined,
      versionNumber: '1.0',
      title: 'A',
      method: 'launcher-metadata',
    },
  ])
})

test('nothing recorded means no sources', async () => {
  const { byName } = await read()
  expect(byName('a.jar')).toBeUndefined()
})
