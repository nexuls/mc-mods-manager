import { describe, expect, test } from 'bun:test'
import type { InstalledMod } from '@mc-mod/shared'
import { countByFilter, displayName, filterMods, parseModrinthRef, projectUrl } from './mods'

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

  test('counts', () => {
    expect(countByFilter(all)).toEqual({
      all: 2,
      disabled: 1,
      unidentified: 1,
      incompatible: 1,
      client: 1,
      server: 1,
    })
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
