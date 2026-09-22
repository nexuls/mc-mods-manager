import { describe, expect, test } from 'bun:test'
import {
  bestCommonVersion,
  compareVersions,
  parseFabricRange,
  parseMavenRange,
  rangeContains,
  type VersionRange,
} from './mc-version'

test('compareVersions', () => {
  expect(compareVersions('1.21', '1.21.0')).toBe(0)
  expect(compareVersions('1.21.1', '1.21')).toBe(1)
  expect(compareVersions('1.9', '1.21')).toBe(-1)
  expect(compareVersions('26.2', '1.21.11')).toBe(1)
  expect(compareVersions('1.21-pre1', '1.21')).toBe(-1)
})

function maven(s: string): VersionRange {
  const r = parseMavenRange(s)
  if (!r) throw new Error(`unparsed ${s}`)
  return r
}

function fabric(s: string | string[]): VersionRange {
  const r = parseFabricRange(s)
  if (!r) throw new Error(`unparsed ${s}`)
  return r
}

describe('parseMavenRange', () => {
  test.each([
    ['[1.21.1]', '1.21.1', true],
    ['[1.21.1]', '1.21.2', false],
    ['[1.21.1,1.22)', '1.21.11', true],
    ['[1.21.1,1.22)', '1.22', false],
    ['[1.21,)', '26.2', true],
    ['(,1.20.4]', '1.20.4', true],
    ['(1.20,1.21)', '1.20', false],
    ['[1.0,1.5),[1.7,)', '1.6', false],
    ['[1.0,1.5),[1.7,)', '1.8', true],
    ['1.21.1', '1.21.1', true],
    ['1.21.1', '1.21', false],
  ])('%s contains %s → %p', (range, v, expected) => {
    expect(rangeContains(maven(range), v)).toBe(expected)
  })

  test('candidates are inclusive bounds', () => {
    expect(maven('[1.21,1.22)').candidates).toEqual(['1.21'])
    expect(maven('[1.21.1]').candidates).toEqual(['1.21.1', '1.21.1'])
  })

  test('rejects garbage', () => {
    expect(parseMavenRange('')).toBeNull()
    expect(parseMavenRange('[]')).toBeNull()
  })
})

describe('parseFabricRange', () => {
  test.each([
    ['*', '1.21.4', true],
    ['1.21.4', '1.21.4', true],
    ['1.21.x', '1.21.4', true],
    ['1.21.x', '1.22', false],
    ['>=1.21 <1.22', '1.21.4', true],
    ['>=1.21 <1.22', '1.22', false],
    ['>1.20.1', '1.20.1', false],
    ['~1.21.1', '1.21.4', true],
    ['~1.21.1', '1.22', false],
    ['^1.21', '1.99', true],
    ['<=1.21.4', '1.21.5', false],
    ['>=1.21-alpha.24.10.a', '1.21', true],
  ])('%s contains %s → %p', (range, v, expected) => {
    expect(rangeContains(fabric(range), v)).toBe(expected)
  })

  test('arrays are OR', () => {
    const r = fabric(['1.20.1', '1.20.4'])
    expect(rangeContains(r, '1.20.4')).toBe(true)
    expect(rangeContains(r, '1.20.2')).toBe(false)
  })
})

describe('bestCommonVersion', () => {
  test('picks the version most ranges accept, despite stray jars', () => {
    const ranges = [
      ...Array.from({ length: 10 }, () => maven('[1.21.1]')),
      maven('[1.21.1,1.22)'),
      maven('[1.21,)'),
      maven('[1.21.11,1.21.12)'),
      maven('[1.20.4]'),
      maven('[1,)'),
    ]
    expect(bestCommonVersion(ranges)).toEqual({ version: '1.21.1', matched: 13, total: 15 })
  })

  test('tie goes to the pinned version, then the newest', () => {
    expect(bestCommonVersion([maven('[1.21,)'), maven('[1.21.4]')])?.version).toBe('1.21.4')
    expect(bestCommonVersion([fabric('>=1.20'), fabric('>=1.21')])?.version).toBe('1.21')
  })

  test('null without candidates', () => {
    expect(bestCommonVersion([])).toBeNull()
    expect(bestCommonVersion([fabric('*')])).toBeNull()
  })
})
