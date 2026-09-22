import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isInside, resolveInside, safeJarName, writeFileAtomic } from './paths'

describe('isInside / resolveInside', () => {
  test.each([
    ['/a/b', '/a/b', true],
    ['/a/b', '/a/b/c/d', true],
    ['/a/b', '/a/bc', false],
    ['/a/b', '/a', false],
    ['/a/b', '/a/b/../c', false],
  ])('%s contains %s → %p', (base, target, expected) => {
    expect(isInside(base, target)).toBe(expected)
  })

  test('resolves relative paths and rejects traversal', () => {
    expect(resolveInside('/inst', 'mods')).toBe('/inst/mods')
    expect(() => resolveInside('/inst', '../etc/passwd')).toThrow('outside')
    expect(() => resolveInside('/inst', '/etc/passwd')).toThrow('outside')
  })
})

describe('writeFileAtomic', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-paths-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('creates parents, replaces content, leaves no temp files', async () => {
    await writeFileAtomic(dir, '.mc-mod/state.json', 'one')
    await writeFileAtomic(dir, '.mc-mod/state.json', 'two')
    expect(await Bun.file(path.join(dir, '.mc-mod/state.json')).text()).toBe('two')
    expect(await readdir(path.join(dir, '.mc-mod'))).toEqual(['state.json'])
  })

  test('refuses to write outside the base', async () => {
    await expect(writeFileAtomic(dir, '../escape.txt', 'x')).rejects.toThrow('outside')
  })
})

test('safeJarName', () => {
  expect(safeJarName('sodium-0.6.0.jar')).toBe('sodium-0.6.0.jar')
  expect(safeJarName('../../evil.jar')).toBe('evil.jar')
  expect(safeJarName('..\\..\\evil.jar')).toBe('evil.jar')
  expect(() => safeJarName('run.sh')).toThrow()
  expect(() => safeJarName('.hidden.jar')).toThrow()
})
