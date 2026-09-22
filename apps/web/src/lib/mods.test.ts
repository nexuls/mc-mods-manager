import { describe, expect, test } from 'bun:test'
import type { InstalledMod } from '@mc-mod/shared'
import {
  countByFilter,
  displayName,
  filterMods,
  parseCurseForgeRef,
  parseModrinthRef,
  projectUrl,
  sortMods,
  toggleSort,
} from './mods'

const mod = (x: Partial<InstalledMod>): InstalledMod => ({
  fileName: 'a.jar',
  enabled: true,
  size: 1,
  sha1: 'a'.repeat(40),
  sha512: 'b'.repeat(128),
  cfFingerprint: 1,
  meta: null,
  sources: [],
  primaryPinned: false,
  unlinked: false,
  conflict: false,
  compatibility: 'ok',
  side: 'both',
  sideSource: 'jar',
  ...x,
})

const sodium = mod({
  fileName: 'sodium.jar',
  side: 'client',
  primarySource: 'modrinth',
  sources: [
    {
      provider: 'modrinth',
      projectId: 'AANobbMI',
      slug: 'sodium',
      title: 'Sodium',
      method: 'hash',
    },
  ],
})
const local = mod({ fileName: 'mine.jar.disabled', enabled: false, compatibility: 'wrong-loader' })

test('displayName prefers the platform title, then jar metadata, then the file', () => {
  expect(displayName(sodium)).toBe('Sodium')
  expect(
    displayName(
      mod({ meta: { name: 'Jar', authors: [], loaders: [], side: 'both', depends: [] } }),
    ),
  ).toBe('Jar')
  expect(displayName(local)).toBe('mine.jar.disabled')
})

describe('filterMods', () => {
  const all = [sodium, local]
  test('filters and searches', () => {
    expect(filterMods(all, 'disabled', '')).toEqual([local])
    expect(filterMods(all, 'unidentified', '')).toEqual([local])
    expect(filterMods(all, 'incompatible', '')).toEqual([local])
    expect(filterMods(all, 'client', '')).toEqual([sodium])
    expect(filterMods(all, 'server', '')).toEqual([local])
    expect(filterMods(all, 'all', 'SOD')).toEqual([sodium])
  })

  test('sorts by display name', () => {
    expect(filterMods([local, sodium], 'all', '').map(displayName)).toEqual([
      'mine.jar.disabled',
      'Sodium',
    ])
  })

  test('updates: jars the last check found an update for', () => {
    const updated = mod({
      ...sodium,
      update: {
        provider: 'modrinth',
        projectId: 'AANobbMI',
        versionId: 'NEW',
        versionNumber: '0.7',
        publishedAt: '2026-02-01T00:00:00Z',
        fileName: 'sodium-0.7.jar',
        size: 1,
        manual: false,
      },
    })
    expect(filterMods([updated, local], 'updates', '')).toEqual([updated])
    expect(countByFilter([updated, local]).updates).toBe(1)
  })

  test('counts', () => {
    expect(countByFilter(all)).toEqual({
      all: 2,
      updates: 0,
      disabled: 1,
      unidentified: 1,
      incompatible: 1,
      client: 1,
      server: 1,
    })
  })
})

describe('sortMods', () => {
  const cf = mod({
    fileName: 'jei.jar',
    side: 'both',
    primarySource: 'curseforge',
    sources: [
      { provider: 'curseforge', projectId: '238222', slug: 'jei', title: 'JEI', method: 'hash' },
    ],
  })
  const iris = mod({
    ...sodium,
    fileName: 'iris.jar',
    sources: [{ ...sodium.sources[0], title: 'Iris' }],
  })
  const all = [sodium, local, cf, iris]
  const names = (key: 'name' | 'source' | 'side' | 'enabled', desc = false) =>
    sortMods(all, { key, desc }).map(displayName)

  test('by name, both directions', () => {
    expect(names('name')).toEqual(['Iris', 'JEI', 'mine.jar.disabled', 'Sodium'])
    expect(names('name', true)).toEqual(['Sodium', 'mine.jar.disabled', 'JEI', 'Iris'])
  })

  test('by source: Modrinth, CurseForge, then local; ties by name A→Z even descending', () => {
    expect(names('source')).toEqual(['Iris', 'Sodium', 'JEI', 'mine.jar.disabled'])
    expect(names('source', true)).toEqual(['mine.jar.disabled', 'JEI', 'Iris', 'Sodium'])
  })

  test('by side: client, server, both, unknown', () => {
    const unknown = mod({ fileName: 'x.jar', side: 'unknown' })
    const server = mod({ fileName: 'y.jar', side: 'server' })
    expect(
      sortMods([unknown, cf, server, sodium], { key: 'side', desc: false }).map((m) => m.side),
    ).toEqual(['client', 'server', 'both', 'unknown'])
  })

  test('by enabled: enabled first', () => {
    expect(names('enabled')).toEqual(['Iris', 'JEI', 'Sodium', 'mine.jar.disabled'])
    expect(names('enabled', true)[0]).toBe('mine.jar.disabled')
  })

  test('does not mutate the input', () => {
    const copy = [...all]
    sortMods(all, { key: 'side', desc: true })
    expect(all).toEqual(copy)
  })

  test('toggleSort flips the same column and starts a new one ascending', () => {
    expect(toggleSort({ key: 'name', desc: false }, 'name')).toEqual({ key: 'name', desc: true })
    expect(toggleSort({ key: 'name', desc: true }, 'side')).toEqual({ key: 'side', desc: false })
  })
})

test('projectUrl', () => {
  expect(projectUrl({ provider: 'modrinth', projectId: 'AANobbMI', slug: 'sodium' })).toBe(
    'https://modrinth.com/project/sodium',
  )
  expect(projectUrl({ provider: 'curseforge', projectId: '394468' })).toBe(
    'https://www.curseforge.com/projects/394468',
  )
})

test.each([
  ['sodium', 'sodium'],
  [' AANobbMI ', 'AANobbMI'],
  ['https://modrinth.com/mod/sodium/versions', 'sodium'],
  ['modrinth.com/plugin/luckperms', 'luckperms'],
  ['not a slug', null],
  ['https://example.com/x', null],
])('parseModrinthRef(%p) → %p', (input, out) => {
  expect(parseModrinthRef(input)).toBe(out)
})

describe('parseCurseForgeRef', () => {
  test.each([
    ['238222', '238222'],
    ['https://www.curseforge.com/minecraft/mc-mods/jei/files/all', 'jei'],
    ['curseforge.com/minecraft/bukkit-plugins/worldedit', 'worldedit'],
    ['https://www.curseforge.com/projects/238222', '238222'],
  ])('%p → %p', (input, ref) => {
    expect(parseCurseForgeRef(input)).toBe(ref)
  })

  test('a bare slug only when asked for', () => {
    expect(parseCurseForgeRef('jei')).toBeNull()
    expect(parseCurseForgeRef('jei', { bareSlug: true })).toBe('jei')
    expect(parseCurseForgeRef('https://modrinth.com/mod/jei', { bareSlug: true })).toBeNull()
  })
})
