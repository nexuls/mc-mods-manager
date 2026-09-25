import { describe, expect, test } from 'bun:test'
import type { ModRecord, ModSource } from '@mc-mod/shared'
import { parseFabricRange } from '../lib/mc-version'
import type { HashMatch } from '../providers/types'
import {
  applyLookup,
  bridgedLoaders,
  buildInstalledMod,
  checkCompatibility,
  detectBridges,
  mergeSources,
  resolveSide,
  runnableLoaders,
} from './identify'

const match: HashMatch = {
  projectId: 'P',
  versionId: 'V',
  versionNumber: '1.0',
  loaders: ['fabric'],
  gameVersions: ['1.21.1'],
  side: 'client',
}

const src = (x: Partial<ModSource> & Pick<ModSource, 'provider' | 'method'>): ModSource => ({
  projectId: 'P',
  ...x,
})

describe('applyLookup', () => {
  test('a hit adds a hash source and records the check', () => {
    const r = applyLookup(undefined, 'modrinth', match, undefined, 5)
    expect(r.sources).toEqual([
      expect.objectContaining({
        provider: 'modrinth',
        projectId: 'P',
        method: 'hash',
        side: 'client',
      }),
    ])
    expect(r.checkedAt).toEqual({ modrinth: 5 })
  })

  test('a miss removes an old hash source but keeps an install record', () => {
    const old: ModRecord = {
      sources: [
        src({ provider: 'modrinth', method: 'hash' }),
        src({ provider: 'curseforge', method: 'hash' }),
      ],
    }
    expect(applyLookup(old, 'modrinth', undefined, undefined, 1).sources).toEqual([
      src({ provider: 'curseforge', method: 'hash' }),
    ])
    const installed: ModRecord = {
      sources: [src({ provider: 'modrinth', method: 'install-record' })],
    }
    expect(applyLookup(installed, 'modrinth', undefined, undefined, 1).sources).toEqual(
      installed.sources,
    )
  })

  test('a hit for the installed project stays an install record', () => {
    const installed: ModRecord = {
      sources: [src({ provider: 'modrinth', method: 'install-record' })],
    }
    expect(applyLookup(installed, 'modrinth', match, undefined, 1).sources?.[0]?.method).toBe(
      'install-record',
    )
  })

  test('keeps user data on the record', () => {
    const r = applyLookup(
      { sideOverride: 'server', unlinked: true },
      'modrinth',
      match,
      undefined,
      1,
    )
    expect(r).toMatchObject({ sideOverride: 'server', unlinked: true })
  })
})

describe('mergeSources', () => {
  const launcherCf = src({ provider: 'curseforge', projectId: '9', method: 'launcher-metadata' })

  test('hash beats launcher metadata for the same provider, others are added', () => {
    const record: ModRecord = { sources: [src({ provider: 'modrinth', method: 'hash' })] }
    const launcher = [
      src({ provider: 'modrinth', projectId: 'X', method: 'launcher-metadata' }),
      launcherCf,
    ]
    const { sources } = mergeSources({ record, launcher, preferred: 'modrinth' })
    expect(sources.map((s) => [s.provider, s.projectId, s.method])).toEqual([
      ['modrinth', 'P', 'hash'],
      ['curseforge', '9', 'launcher-metadata'],
    ])
  })

  test('manual link beats launcher metadata', () => {
    const record: ModRecord = {
      manual: src({ provider: 'curseforge', projectId: '1', method: 'manual' }),
    }
    const { sources } = mergeSources({ record, launcher: [launcherCf], preferred: 'modrinth' })
    expect(sources).toEqual([src({ provider: 'curseforge', projectId: '1', method: 'manual' })])
  })

  test('an exact hash that disagrees with a manual link wins, with a conflict', () => {
    const record: ModRecord = {
      sources: [src({ provider: 'modrinth', method: 'hash' })],
      manual: src({ provider: 'modrinth', projectId: 'OTHER', method: 'manual' }),
    }
    const out = mergeSources({ record, launcher: [], preferred: 'modrinth' })
    expect(out.conflict).toBe(true)
    expect(out.sources.map((s) => s.projectId)).toEqual(['P'])
  })

  test('unlinked hides every source', () => {
    const record: ModRecord = {
      unlinked: true,
      sources: [src({ provider: 'modrinth', method: 'hash' })],
    }
    expect(mergeSources({ record, launcher: [launcherCf], preferred: 'modrinth' }).sources).toEqual(
      [],
    )
  })

  test('same method: the preferred provider comes first', () => {
    const record: ModRecord = {
      sources: [
        src({ provider: 'modrinth', method: 'hash' }),
        src({ provider: 'curseforge', method: 'hash' }),
      ],
    }
    const first = (preferred: 'modrinth' | 'curseforge') =>
      mergeSources({ record, launcher: [], preferred }).sources[0]?.provider
    expect(first('curseforge')).toBe('curseforge')
    expect(first('modrinth')).toBe('modrinth')
  })
})

describe('checkCompatibility', () => {
  const fabric = { loader: 'fabric', gameVersion: '1.21.1', contentKind: 'mod' } as const
  const noJar = { meta: null, minecraft: null }
  const hashed = (loaders: string[], gameVersions: string[]) => [
    src({ provider: 'modrinth', method: 'hash', loaders, gameVersions }),
  ]

  test('platform data decides when there is a hash match', () => {
    expect(checkCompatibility(fabric, noJar, hashed(['fabric'], ['1.21.1'])).compatibility).toBe(
      'ok',
    )
    expect(checkCompatibility(fabric, noJar, hashed(['forge', 'neoforge'], ['1.21.1']))).toEqual({
      compatibility: 'wrong-loader',
      reason: 'Built for Forge, NeoForge',
    })
    expect(checkCompatibility(fabric, noJar, hashed(['fabric'], ['1.20.1', '1.20.2']))).toEqual({
      compatibility: 'wrong-game-version',
      reason: 'Made for 1.20.1, 1.20.2',
    })
  })

  test('Quilt runs Fabric builds; plugin game versions are not checked', () => {
    const quilt = { ...fabric, loader: 'quilt' } as const
    expect(checkCompatibility(quilt, noJar, hashed(['fabric'], ['1.21.1'])).compatibility).toBe(
      'ok',
    )
    const paper = { loader: 'paper', gameVersion: '1.21.8', contentKind: 'plugin' } as const
    expect(
      checkCompatibility(paper, noJar, hashed(['bukkit', 'spigot'], ['1.20'])).compatibility,
    ).toBe('ok')
  })

  test('falls back to jar metadata', () => {
    const jar = (loaders: ('fabric' | 'forge')[], range: string) => ({
      meta: { authors: [], loaders, side: 'both' as const, depends: [] },
      minecraft: parseFabricRange(range),
    })
    expect(checkCompatibility(fabric, jar(['fabric'], '>=1.21'), []).compatibility).toBe('ok')
    expect(checkCompatibility(fabric, jar(['forge'], '*'), []).compatibility).toBe('wrong-loader')
    expect(checkCompatibility(fabric, jar(['fabric'], '1.20.4'), [])).toEqual({
      compatibility: 'wrong-game-version',
      reason: 'Declares Minecraft 1.20.4',
    })
    expect(checkCompatibility(fabric, noJar, []).compatibility).toBe('unknown')
  })

  test('unknown without an instance loader', () => {
    const none = { loader: null, gameVersion: null, contentKind: 'mod' } as const
    expect(checkCompatibility(none, noJar, hashed(['forge'], [])).compatibility).toBe('unknown')
  })

  // A Fabric build on NeoForge used to read as "Built for Fabric" — a dead end — even though the
  // instance may well be running it through a translation layer.
  test('a Fabric build on NeoForge 1.21.1 is bridged, not wrong-loader', () => {
    const neo = { loader: 'neoforge', gameVersion: '1.21.1', contentKind: 'mod' } as const
    expect(checkCompatibility(neo, noJar, hashed(['fabric'], ['1.21.1']))).toEqual({
      compatibility: 'bridged',
      reason: 'Fabric build — needs Sinytra Connector',
      bridge: 'sinytra-connector',
    })
    // With the layer in the folder it stops being a question mark.
    expect(
      checkCompatibility(neo, noJar, hashed(['fabric'], ['1.21.1']), ['sinytra-connector']).reason,
    ).toBe('Fabric build — runs through Sinytra Connector')
  })

  test('a bridge never excuses the wrong game version, or a loader it does not cover', () => {
    const neo = { loader: 'neoforge', gameVersion: '1.21.1', contentKind: 'mod' } as const
    expect(checkCompatibility(neo, noJar, hashed(['fabric'], ['1.20.1'])).compatibility).toBe(
      'wrong-game-version',
    )
    // Connector runs Fabric on Forge at 1.20.1 only, and never runs Quilt-only builds.
    const forge = { loader: 'forge', gameVersion: '1.19.2', contentKind: 'mod' } as const
    expect(checkCompatibility(forge, noJar, hashed(['fabric'], ['1.19.2'])).compatibility).toBe(
      'wrong-loader',
    )
    expect(checkCompatibility(neo, noJar, hashed(['quilt'], ['1.21.1'])).compatibility).toBe(
      'wrong-loader',
    )
  })
})

describe('bridgedLoaders', () => {
  test('Connector covers Fabric on NeoForge 1.21+ and on Forge 1.20.1 only', () => {
    expect(bridgedLoaders('neoforge', '1.21.1').map((b) => b.loader)).toEqual(['fabric'])
    expect(bridgedLoaders('forge', '1.20.1').map((b) => b.bridge.id)).toEqual(['sinytra-connector'])
    expect(bridgedLoaders('forge', '1.21.1')).toEqual([])
    expect(bridgedLoaders('neoforge', '1.20.1')).toEqual([])
    // Fabric and Quilt already run Fabric builds, so a bridge would be noise.
    expect(bridgedLoaders('fabric', '1.21.1')).toEqual([])
    expect(bridgedLoaders('quilt', '1.21.1')).toEqual([])
  })

  test('an unknown game version cannot rule a bridge out', () => {
    expect(bridgedLoaders('neoforge', null).map((b) => b.loader)).toEqual(['fabric'])
  })
})

describe('detectBridges', () => {
  test('finds a layer by the mod id its jar declares', () => {
    const jar = (id?: string) => ({
      meta: id ? { id, authors: [], loaders: [], side: 'both' as const, depends: [] } : null,
    })
    expect(detectBridges([jar('sodium'), jar('Connector'), jar()])).toEqual(['sinytra-connector'])
    expect(detectBridges([jar('sodium')])).toEqual([])
  })
})

test('runnableLoaders: NeoForge 1.20.1 still runs Forge mods', () => {
  expect(runnableLoaders('neoforge', '1.20.1')).toContain('forge')
  expect(runnableLoaders('neoforge', '1.21.1')).not.toContain('forge')
})

describe('resolveSide', () => {
  const mr = src({ provider: 'modrinth', method: 'hash', side: 'client' })
  const cf = src({ provider: 'curseforge', method: 'hash', side: 'both' })

  test('platform (primary first) > override > jar > unknown', () => {
    expect(resolveSide('server', [mr], 'modrinth', 'both')).toEqual({
      side: 'client',
      sideSource: 'platform',
    })
    expect(
      resolveSide('server', [src({ provider: 'modrinth', method: 'hash' })], 'modrinth', 'both'),
    ).toEqual({
      side: 'server',
      sideSource: 'override',
    })
    expect(resolveSide('server', [], undefined, 'both')).toEqual({
      side: 'server',
      sideSource: 'override',
    })
    expect(resolveSide(undefined, [mr, cf], 'curseforge', 'both')).toEqual({
      side: 'both',
      sideSource: 'platform',
    })
    expect(resolveSide(undefined, [], undefined, 'client')).toEqual({
      side: 'client',
      sideSource: 'jar',
    })
    expect(resolveSide(undefined, [], undefined, 'unknown')).toEqual({
      side: 'unknown',
      sideSource: 'unknown',
    })
  })
})

describe('buildInstalledMod', () => {
  const jar = {
    fileName: 'a.jar',
    enabled: true,
    size: 1,
    mtimeMs: 1,
    sha1: 'a'.repeat(40),
    sha512: 'b'.repeat(128),
    cfFingerprint: 1,
    meta: null,
    minecraft: null,
  }
  const instance = { loader: 'fabric', gameVersion: '1.21.1', contentKind: 'mod' } as const
  const record: ModRecord = {
    sources: [
      src({ provider: 'modrinth', method: 'hash' }),
      src({ provider: 'curseforge', method: 'hash' }),
    ],
  }

  test('primary is the preferred provider unless pinned', () => {
    const build = (r: ModRecord) =>
      buildInstalledMod({
        jar,
        record: r,
        launcher: [],
        instance,
        preferred: 'modrinth',
        projects: new Map(),
      })
    expect(build(record)).toMatchObject({ primarySource: 'modrinth', primaryPinned: false })
    expect(build({ ...record, primarySource: 'curseforge' })).toMatchObject({
      primarySource: 'curseforge',
      primaryPinned: true,
    })
  })

  test('fills titles from projects fetched from the same platform', () => {
    const projects = new Map([
      [
        'modrinth:P',
        { id: 'P', slug: 'p', title: 'Project P', description: '', side: 'server' as const },
      ],
    ])
    const mod = buildInstalledMod({
      jar,
      record,
      launcher: [],
      instance,
      preferred: 'modrinth',
      projects,
    })
    expect(mod.sources[0]).toMatchObject({ title: 'Project P', side: 'server' })
    expect(mod.sources[1]?.title).toBeUndefined()
    expect(mod).toMatchObject({ side: 'server', sideSource: 'platform' })
  })
})
