import { expect, test } from 'bun:test'
import { parseBrowseParams, projectLink, projectOrigin, toBrowseParams } from './browse'

test('bad or missing params fall back to defaults', () => {
  expect(
    parseBrowseParams(new URLSearchParams('provider=x&sort=best&page=-3&category=A%20B&all=yes')),
  ).toEqual({
    provider: 'modrinth',
    q: '',
    sort: 'relevance',
    category: undefined,
    all: false,
    page: 0,
  })
})

test('round-trips and leaves defaults out', () => {
  const s = parseBrowseParams(
    new URLSearchParams('provider=curseforge&q=jei&sort=downloads&all=1&page=2'),
  )
  expect(s).toEqual({
    provider: 'curseforge',
    q: 'jei',
    sort: 'downloads',
    category: undefined,
    all: true,
    page: 2,
  })
  expect(toBrowseParams(s).toString()).toBe('provider=curseforge&q=jei&sort=downloads&all=1&page=2')
  expect(
    toBrowseParams({
      ...s,
      provider: 'modrinth',
      q: '',
      sort: 'relevance',
      all: false,
      page: 0,
    }).toString(),
  ).toBe('')
})

test('project links keep the list params and remember which list opened them', () => {
  expect(projectLink('/project/modrinth/sodium', { pathname: '/', search: '?q=sod' })).toEqual({
    to: { pathname: '/project/modrinth/sodium', search: '?q=sod' },
    state: { from: '/' },
  })
  expect(projectLink('/project/curseforge/1', { pathname: '/browse', search: '' }).state).toEqual({
    from: '/browse',
  })
})

test('the project origin falls back to /browse for missing or foreign history state', () => {
  expect(projectOrigin({ from: '/' })).toBe('/')
  expect(projectOrigin(null)).toBe('/browse')
  expect(projectOrigin({ from: '/settings' })).toBe('/browse')
})
