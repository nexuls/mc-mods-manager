import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import type { ProjectVersion, VersionDependency } from '@mc-mod/shared'
import { fakeCurseForge } from '../../test/fake-curseforge'
import { fakeModrinth } from '../../test/fake-modrinth'
import { copyFixture } from '../../test/fixtures'
import { makeJar } from '../../test/jar'
import { makeServices } from '../../test/services'
import { hashBytes } from '../jar/hash'
import type { ProjectInfo } from '../providers/types'
import { InstanceService } from './instance'

const project = (id: string, side: ProjectInfo['side'] = 'both'): ProjectInfo => ({
  id,
  slug: id.toLowerCase(),
  title: `${id} mod`,
  description: '',
  side,
})

const version = (
  projectId: string,
  dependencies: VersionDependency[] = [],
  over: Partial<ProjectVersion> = {},
): ProjectVersion => ({
  provider: 'modrinth',
  id: `${projectId}-v1`,
  projectId,
  name: 'v1',
  versionNumber: '1.0',
  type: 'release',
  publishedAt: '2026-01-01T00:00:00Z',
  downloads: 0,
  loaders: ['fabric'],
  gameVersions: ['1.21.4'],
  file: {
    name: `${projectId.toLowerCase()}-1.0.jar`,
    url: 'https://cdn.modrinth.com/x.jar',
    size: 7,
  },
  dependencies,
  ...over,
})

const req = (projectId: string): VersionDependency => ({ projectId, type: 'required' })

const installedJar = makeJar({ 'fabric.mod.json': JSON.stringify({ id: 'have', version: '1' }) })

/** Prism fixture (Fabric 1.21.4) with HAVE installed and identified by hash. */
async function setup(versions: ProjectVersion[], projects: ProjectInfo[]) {
  const f = await copyFixture('prism')
  await Bun.write(path.join(f.dir, 'minecraft/mods/have-1.0.jar'), installedJar)
  const fake = fakeModrinth({
    projects: [...projects, project('HAVE')],
    versions,
    matches: {
      [hashBytes(installedJar).sha1]: {
        projectId: 'HAVE',
        versionId: 'HAVE-v1',
        versionNumber: '1',
        loaders: ['fabric'],
        gameVersions: ['1.21.4'],
      },
    },
  })
  const services = makeServices({
    instance: await InstanceService.load(f.dir),
    modrinth: fake.modrinth,
  })
  return { installer: services.installer, [Symbol.asyncDispose]: f[Symbol.asyncDispose] }
}

describe('plan', () => {
  test('follows required deps, lists optional ones, skips installed', async () => {
    await using t = await setup(
      [
        version('MAIN', [
          req('A'),
          { projectId: 'C', type: 'optional' },
          { projectId: 'E', type: 'embedded' },
        ]),
        version('A', [req('B'), req('HAVE'), { projectId: 'D', type: 'optional' }]),
        version('B', [req('A')]),
        version('C'),
        version('D'),
      ],
      ['MAIN', 'A', 'B', 'C', 'D', 'E'].map((id) => project(id)),
    )
    const { items, warnings } = await t.installer.plan({ provider: 'modrinth', projectId: 'main' })
    expect(warnings).toEqual([])
    expect(items.map((i) => [i.projectId, i.role, i.status, i.requiredBy])).toEqual([
      ['MAIN', 'main', 'install', []],
      ['A', 'required', 'install', ['MAIN mod', 'B mod']],
      ['C', 'optional', 'install', ['MAIN mod']],
      ['B', 'required', 'install', ['A mod']],
      ['HAVE', 'required', 'installed', ['A mod']],
    ])
    expect(items[0]).toMatchObject({ versionId: 'MAIN-v1', fileName: 'main-1.0.jar', size: 7 })
    expect(items[4]?.reason).toBe('Installed as have-1.0.jar')
  })

  test('warns about missing deps and incompatible installed mods', async () => {
    await using t = await setup(
      [version('MAIN', [req('GONE'), { projectId: 'HAVE', type: 'incompatible' }])],
      [project('MAIN'), project('GONE')],
    )
    const { items, warnings } = await t.installer.plan({ provider: 'modrinth', projectId: 'MAIN' })
    expect(items[1]).toMatchObject({ projectId: 'GONE', status: 'unavailable' })
    expect(warnings).toEqual([
      'GONE mod (needed by MAIN mod) has no version for Fabric 1.21.4.',
      'MAIN mod is incompatible with HAVE mod, which is installed.',
    ])
  })

  test('an optional dep required later is promoted and followed', async () => {
    await using t = await setup(
      [
        version('MAIN', [{ projectId: 'C', type: 'optional' }, req('A')]),
        version('A', [req('C')]),
        version('C', [req('B')]),
        version('B'),
      ],
      ['MAIN', 'A', 'B', 'C'].map((id) => project(id)),
    )
    const { items } = await t.installer.plan({ provider: 'modrinth', projectId: 'MAIN' })
    expect(items.map((i) => [i.projectId, i.role])).toEqual([
      ['MAIN', 'main'],
      ['C', 'required'],
      ['A', 'required'],
      ['B', 'required'],
    ])
  })

  test('a hand-picked version that does not fit is a warning', async () => {
    const forge = version('MAIN', [], { id: 'FORGE', loaders: ['forge'], versionNumber: '2.0' })
    await using t = await setup([forge], [project('MAIN')])
    const res = await t.installer.plan({
      provider: 'modrinth',
      projectId: 'MAIN',
      versionId: 'FORGE',
    })
    expect(res.items[0]).toMatchObject({ status: 'install', versionId: 'FORGE' })
    expect(res.warnings).toEqual(["MAIN mod 2.0 isn't made for Fabric 1.21.4."])
    await expect(
      t.installer.plan({ provider: 'modrinth', projectId: 'MAIN', versionId: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('an installed main project is not planned again', async () => {
    await using t = await setup([version('HAVE')], [])
    const { items } = await t.installer.plan({ provider: 'modrinth', projectId: 'HAVE' })
    expect(items).toEqual([expect.objectContaining({ status: 'installed', role: 'main' })])
  })

  test('no fitting version: the main item is unavailable', async () => {
    await using t = await setup(
      [version('MAIN', [], { gameVersions: ['1.20.1'] })],
      [project('MAIN')],
    )
    const res = await t.installer.plan({ provider: 'modrinth', projectId: 'MAIN' })
    expect(res.items[0]).toMatchObject({
      status: 'unavailable',
      reason: 'No version for Fabric 1.21.4',
    })
    expect(res.warnings).toEqual(['MAIN mod has no version for Fabric 1.21.4.'])
  })
})

describe('plan on CurseForge', () => {
  const cfVersion = (projectId: string, deps: VersionDependency[] = [], url: string | null = 'x') =>
    version(projectId, deps, {
      provider: 'curseforge',
      id: `${projectId}0`,
      loaders: ['fabric'],
      file: {
        name: `cf-${projectId}.jar`,
        url: url && 'https://edge.forgecdn.net/files/1/2/x.jar',
        size: 9,
        sha1: 'a'.repeat(40),
      },
      pageUrl: `https://www.curseforge.com/minecraft/mc-mods/p${projectId}/files/${projectId}0`,
    })

  async function cfSetup() {
    const f = await copyFixture('prism')
    await Bun.write(path.join(f.dir, 'minecraft/mods/have-1.0.jar'), installedJar)
    const cf = fakeCurseForge({
      projects: ['100', '200', '300', '400'].map((id) => project(id)),
      versions: [
        cfVersion('100', [req('200'), req('300'), req('400')]),
        cfVersion('200'),
        cfVersion('300', [], null),
      ],
      matches: {
        [hashBytes(installedJar).cfFingerprint]: {
          projectId: '400',
          versionId: '4000',
          versionNumber: '1',
          loaders: ['fabric'],
          gameVersions: ['1.21.4'],
        },
      },
    })
    const services = makeServices({
      instance: await InstanceService.load(f.dir),
      modrinth: fakeModrinth().modrinth,
      curseforge: cf.curseforge,
    })
    return { installer: services.installer, [Symbol.asyncDispose]: f[Symbol.asyncDispose] }
  }

  test('follows deps on CurseForge; no download URL means a manual item', async () => {
    await using t = await cfSetup()
    const { items, warnings } = await t.installer.plan({
      provider: 'curseforge',
      projectId: '100',
    })
    expect(items.map((i) => [i.provider, i.projectId, i.status])).toEqual([
      ['curseforge', '100', 'install'],
      ['curseforge', '200', 'install'],
      ['curseforge', '300', 'manual'],
      ['curseforge', '400', 'installed'],
    ])
    expect(items[2]).toMatchObject({
      pageUrl: 'https://www.curseforge.com/minecraft/mc-mods/p300/files/3000',
      reason: 'Download by hand from CurseForge',
    })
    expect(warnings).toEqual([
      "300 mod's author only allows downloads from the CurseForge website. Download it there and put it in the mods folder.",
    ])
  })

  test('without a key CurseForge plans are PROVIDER_DISABLED', async () => {
    await using f = await copyFixture('prism')
    const services = makeServices({
      instance: await InstanceService.load(f.dir),
      modrinth: fakeModrinth().modrinth,
    })
    expect(
      services.installer.plan({ provider: 'curseforge', projectId: '100' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DISABLED' })
  })
})
