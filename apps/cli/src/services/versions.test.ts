import { describe, expect, test } from 'bun:test'
import type { ProjectVersion } from '@mc-mod/shared'
import { pickBest, queryLoaders, rankVersions, type VersionContext } from './versions'

let n = 0
function v(over: Partial<ProjectVersion> = {}): ProjectVersion {
  n++
  return {
    provider: 'modrinth',
    id: `V${n}`,
    projectId: 'P',
    name: `v${n}`,
    versionNumber: `${n}.0`,
    type: 'release',
    publishedAt: '2026-01-01T00:00:00Z',
    downloads: 0,
    loaders: ['fabric'],
    gameVersions: ['1.21.1'],
    file: { name: 'a.jar', url: 'https://cdn.modrinth.com/a.jar', size: 1 },
    dependencies: [],
    ...over,
  }
}

const fabric: VersionContext = {
  loader: 'fabric',
  gameVersion: '1.21.1',
  contentKind: 'mod',
  allowPrerelease: false,
}

describe('pickBest', () => {
  test('newest release wins', () => {
    const old = v({ publishedAt: '2026-01-01T00:00:00Z' })
    const recent = v({ publishedAt: '2026-03-01T00:00:00Z' })
    expect(pickBest([old, recent], fabric)?.id).toBe(recent.id)
  })

  test('a release beats a newer beta unless pre-releases are allowed', () => {
    const release = v({ publishedAt: '2026-01-01T00:00:00Z' })
    const beta = v({ type: 'beta', publishedAt: '2026-03-01T00:00:00Z' })
    expect(pickBest([beta, release], fabric)?.id).toBe(release.id)
    expect(pickBest([beta, release], { ...fabric, allowPrerelease: true })?.id).toBe(beta.id)
  })

  test('a beta is picked when there is no release', () => {
    const alpha = v({ type: 'alpha', publishedAt: '2026-03-01T00:00:00Z' })
    const beta = v({ type: 'beta', publishedAt: '2026-01-01T00:00:00Z' })
    expect(pickBest([alpha, beta], fabric)?.id).toBe(beta.id)
  })

  test('wrong game version or loader is never picked', () => {
    expect(pickBest([v({ gameVersions: ['1.21'] }), v({ loaders: ['forge'] })], fabric)).toBe(
      undefined,
    )
  })

  test('a version without a jar is not recommended', () => {
    expect(pickBest([v({ file: null })], fabric)).toBe(undefined)
  })

  test('Quilt takes a Fabric build only without a native one', () => {
    const quilt: VersionContext = { ...fabric, loader: 'quilt' }
    const fab = v({ publishedAt: '2026-03-01T00:00:00Z' })
    const native = v({ loaders: ['quilt'], publishedAt: '2026-01-01T00:00:00Z' })
    expect(pickBest([fab, native], quilt)?.id).toBe(native.id)
    const only = pickBest([fab], quilt)
    expect(only).toMatchObject({ id: fab.id, note: 'Fabric build' })
  })

  test('loader names are compared case-insensitively', () => {
    expect(pickBest([v({ loaders: ['Fabric'] })], fabric)).toBeDefined()
  })

  test('plugins accept versions made for an older game version, preferring exact', () => {
    const paper: VersionContext = {
      loader: 'paper',
      gameVersion: '1.21.4',
      contentKind: 'plugin',
      allowPrerelease: false,
    }
    const older = v({ loaders: ['paper'], gameVersions: ['1.20.6', '1.21'] })
    const newer = v({ loaders: ['paper'], gameVersions: ['1.22'] })
    expect(pickBest([older, newer], paper)).toMatchObject({ id: older.id, note: 'Made for 1.21' })
    const exact = v({ loaders: ['paper'], gameVersions: ['1.21.4'], publishedAt: '2025-01-01' })
    expect(pickBest([older, exact], paper)?.id).toBe(exact.id)
    // A native build for an older version still beats a Spigot build for this one.
    const spigot = v({ loaders: ['spigot'], gameVersions: ['1.21.4'] })
    expect(pickBest([older, spigot], paper)?.id).toBe(older.id)
    expect(pickBest([spigot], paper)).toMatchObject({ note: 'Spigot build' })
  })
})

test('rankVersions keeps the order and flags compatibility', () => {
  const list = [v({ loaders: ['forge'] }), v(), v()]
  const ranked = rankVersions(list, fabric)
  expect(ranked.map((r) => r.id)).toEqual(list.map((x) => x.id))
  expect(ranked.map((r) => r.compatible)).toEqual([false, true, true])
  expect(ranked.filter((r) => r.recommended)).toHaveLength(1)
})

test('queryLoaders', () => {
  expect(queryLoaders({ loader: 'quilt', gameVersion: '1.21.1' })).toEqual(['quilt', 'fabric'])
  expect(queryLoaders({ loader: 'vanilla', gameVersion: '1.21.1' })).toEqual([])
  expect(queryLoaders({ loader: null, gameVersion: null })).toEqual([])
})

describe('loader bridges', () => {
  const neoforge: VersionContext = { ...fabric, loader: 'neoforge' }

  test('a Fabric build is offered on NeoForge, and says which layer runs it', () => {
    const [ranked] = rankVersions([v({ loaders: ['fabric'] })], neoforge)
    expect(ranked).toMatchObject({ compatible: true, bridge: 'sinytra-connector' })
    expect(ranked?.note).toBe('Fabric build · needs Sinytra Connector')
    const [installed] = rankVersions([v({ loaders: ['fabric'] })], {
      ...neoforge,
      bridges: ['sinytra-connector'],
    })
    expect(installed?.note).toBe('Fabric build · runs through Sinytra Connector')
  })

  test('a native build always wins over a bridged one, however new', () => {
    const native = v({ loaders: ['neoforge'], publishedAt: '2026-01-01T00:00:00Z' })
    const bridged = v({ loaders: ['fabric'], publishedAt: '2026-06-01T00:00:00Z' })
    expect(pickBest([bridged, native], neoforge)?.id).toBe(native.id)
    expect(pickBest([bridged], neoforge)?.id).toBe(bridged.id)
  })

  test('queryLoaders only widens the platform filter once the layer is installed', () => {
    expect(queryLoaders(neoforge)).not.toContain('fabric')
    expect(queryLoaders({ ...neoforge, bridges: ['sinytra-connector'] })).toContain('fabric')
  })
})
