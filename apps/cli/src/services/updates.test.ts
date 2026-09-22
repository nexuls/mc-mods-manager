import { describe, expect, test } from 'bun:test'
import type { InstalledMod, ModUpdate, RankedVersion } from '@mc-mod/shared'
import { findUpdate, UpdateStore, withUpdate } from './updates'
import type { VersionContext } from './versions'

const SHA1 = 'a'.repeat(40)

const v = (id: string, publishedAt: string, over: Partial<RankedVersion> = {}): RankedVersion => ({
  provider: 'modrinth',
  id,
  projectId: 'P',
  name: id,
  versionNumber: id,
  type: 'release',
  publishedAt,
  downloads: 0,
  loaders: ['fabric'],
  gameVersions: ['1.21.4'],
  file: { name: `${id}.jar`, url: `https://cdn.modrinth.com/${id}.jar`, size: 3 },
  dependencies: [],
  compatible: true,
  recommended: false,
  ...over,
})

describe('findUpdate', () => {
  const old = v('OLD', '2026-01-01T00:00:00Z')
  const best = v('NEW', '2026-02-01T00:00:00Z', { recommended: true })

  test('offers the recommended version when it is newer', () => {
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'OLD' }, [best, old])).toEqual({
      provider: 'modrinth',
      projectId: 'P',
      versionId: 'NEW',
      versionNumber: 'NEW',
      publishedAt: '2026-02-01T00:00:00Z',
      fileName: 'NEW.jar',
      size: 3,
      manual: false,
      pageUrl: undefined,
    })
  })

  test('nothing when the installed version is the recommended one, by id or by file', () => {
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'NEW' }, [best, old])).toBeUndefined()
    const sameFile = {
      ...best,
      file: { name: 'x.jar', url: 'u', size: 1, sha1: SHA1.toUpperCase() },
    }
    expect(findUpdate({ sha1: SHA1 }, { versionId: undefined }, [sameFile])).toBeUndefined()
  })

  test('never a downgrade, e.g. off a newer beta while releases win', () => {
    const beta = v('BETA', '2026-03-01T00:00:00Z', { type: 'beta' })
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'BETA' }, [beta, best])).toBeUndefined()
  })

  test('an installed version that does not fit the instance gets the fitting one', () => {
    const wrong = v('WRONG', '2026-03-01T00:00:00Z', { compatible: false })
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'WRONG' }, [wrong, best])?.versionId).toBe('NEW')
    // Known, but not listed for this loader and game version at all.
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'ELSEWHERE' }, [best])?.versionId).toBe('NEW')
  })

  test('nothing when the installed version is unknown (a manual link)', () => {
    expect(findUpdate({ sha1: SHA1 }, { versionId: undefined }, [best, old])).toBeUndefined()
  })

  test('a file without a download URL is a manual update', () => {
    const manual = v('NEW', '2026-02-01T00:00:00Z', {
      provider: 'curseforge',
      recommended: true,
      file: { name: 'n.jar', url: null, size: 1 },
      pageUrl: 'https://www.curseforge.com/minecraft/mc-mods/p/files/2',
    })
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'OLD' }, [manual, old])).toMatchObject({
      manual: true,
      pageUrl: 'https://www.curseforge.com/minecraft/mc-mods/p/files/2',
    })
  })

  test('nothing without a recommended version', () => {
    expect(findUpdate({ sha1: SHA1 }, { versionId: 'OLD' }, [old])).toBeUndefined()
  })
})

const update: ModUpdate = {
  provider: 'modrinth',
  projectId: 'P',
  versionId: 'NEW',
  versionNumber: '2',
  publishedAt: '2026-02-01T00:00:00Z',
  fileName: 'p-2.jar',
  size: 1,
  manual: false,
}

describe('UpdateStore', () => {
  test('results only hold for the setup they were found with', () => {
    const ctx: VersionContext = {
      loader: 'fabric',
      gameVersion: '1.21.4',
      contentKind: 'mod',
      allowPrerelease: false,
    }
    const store = new UpdateStore(() => ctx)
    store.save(new Map([[SHA1, update]]))
    expect(store.get(SHA1)).toEqual(update)
    ctx.gameVersion = '1.21.5'
    expect(store.get(SHA1)).toBeUndefined()
    ctx.gameVersion = '1.21.4'
    store.save(new Map([[SHA1, undefined]]))
    expect(store.get(SHA1)).toBeUndefined()
  })
})

describe('withUpdate', () => {
  const mod = {
    sources: [
      { provider: 'modrinth', projectId: 'P', method: 'hash' },
      { provider: 'curseforge', projectId: '1', method: 'hash' },
    ],
    primarySource: 'modrinth',
  } as const satisfies Partial<InstalledMod>
  const full = mod as unknown as InstalledMod // only sources and primarySource are read

  test('adds the update from the source updates come from', () => {
    expect(withUpdate(full, update).update).toEqual(update)
    expect(withUpdate(full, { ...update, provider: 'curseforge' }).update).toBeUndefined()
    expect(withUpdate({ ...full, update }, undefined)).not.toHaveProperty('update')
  })
})
