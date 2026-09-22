import { expect, test } from 'bun:test'
import { parseBrowseParams, toBrowseParams } from './browse'

test('bad or missing params fall back to defaults', () => {
  expect(
    parseBrowseParams(new URLSearchParams('sort=best&page=-3&category=A%20B&all=yes')),
  ).toEqual({ q: '', sort: 'relevance', category: undefined, all: false, page: 0 })
})

test('round-trips and leaves defaults out', () => {
  const s = parseBrowseParams(new URLSearchParams('q=sodium&sort=downloads&all=1&page=2'))
  expect(s).toEqual({ q: 'sodium', sort: 'downloads', category: undefined, all: true, page: 2 })
  expect(toBrowseParams(s).toString()).toBe('q=sodium&sort=downloads&all=1&page=2')
  expect(toBrowseParams({ ...s, q: '', sort: 'relevance', all: false, page: 0 }).toString()).toBe(
    '',
  )
})
