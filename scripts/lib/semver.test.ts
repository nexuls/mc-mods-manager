import { describe, expect, test } from 'bun:test'
import { bumpVersion, isPrerelease } from './semver'

describe('bumpVersion', () => {
  test.each([
    ['0.0.0', 'patch', '0.0.1'],
    ['0.0.0', 'minor', '0.1.0'],
    ['0.1.9', 'major', '1.0.0'],
    ['1.2.3', 'prepatch', '1.2.4-beta.0'],
    ['1.2.3', 'preminor', '1.3.0-beta.0'],
    ['1.2.3', 'premajor', '2.0.0-beta.0'],
    ['1.2.3', 'prerelease', '1.2.4-beta.0'],
    ['1.2.4-beta.0', 'prerelease', '1.2.4-beta.1'],
    ['1.2.4-alpha.3', 'prerelease', '1.2.4-beta.0'],
    ['1.2.4-beta.1', 'patch', '1.2.4'],
    ['1.3.0-beta.1', 'minor', '1.3.0'],
    ['1.3.1-beta.1', 'minor', '1.4.0'],
    ['2.0.0-beta.1', 'major', '2.0.0'],
  ] as const)('%s + %s → %s', (from, bump, to) => {
    expect(bumpVersion(from, bump)).toBe(to)
  })

  test('uses the given prerelease id', () => {
    expect(bumpVersion('1.0.0', 'preminor', 'rc')).toBe('1.1.0-rc.0')
  })

  test('rejects bad input', () => {
    expect(() => bumpVersion('1.0', 'patch')).toThrow()
    expect(() => bumpVersion('1.0.0', 'prerelease', 'no spaces')).toThrow()
  })
})

test('isPrerelease', () => {
  expect(isPrerelease('1.0.0')).toBe(false)
  expect(isPrerelease('1.0.0-rc.1')).toBe(true)
})
