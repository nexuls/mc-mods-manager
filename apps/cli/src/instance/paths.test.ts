import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  copyFileAtomic,
  isInside,
  moveToTrash,
  removeInside,
  renameInside,
  resolveInside,
  safeJarName,
  samePath,
  writeFileAtomic,
} from './paths'

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
    expect(resolveInside('/inst', 'mods')).toBe(path.resolve('/inst/mods'))
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

describe('copyFileAtomic / removeInside', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-paths-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('copies over an existing file, leaves no temp files, keeps the source', async () => {
    await Bun.write(path.join(dir, 'mods/a.jar'), 'new')
    await Bun.write(path.join(dir, 'out/a.jar'), 'old')
    await copyFileAtomic(dir, 'mods/a.jar', 'out/a.jar')
    expect(await Bun.file(path.join(dir, 'out/a.jar')).text()).toBe('new')
    expect(await readdir(path.join(dir, 'out'))).toEqual(['a.jar'])
    expect(await Bun.file(path.join(dir, 'mods/a.jar')).text()).toBe('new')
  })

  test('refuses sources and targets outside the base', async () => {
    await Bun.write(path.join(dir, 'mods/a.jar'), 'x')
    await expect(copyFileAtomic(dir, 'mods/a.jar', '../a.jar')).rejects.toThrow('outside')
    await expect(copyFileAtomic(dir, '/etc/hostname', 'a.jar')).rejects.toThrow('outside')
  })

  test('removes files inside the base only', async () => {
    await Bun.write(path.join(dir, 'out/a.jar'), 'x')
    await removeInside(dir, 'out/a.jar')
    await removeInside(dir, 'out/missing.jar')
    expect(await readdir(path.join(dir, 'out'))).toEqual([])
    await expect(removeInside(dir, '../x')).rejects.toThrow('outside')
  })
})

test('samePath ignores case where the filesystem does', () => {
  const [a, b] = [path.resolve('/Games/Minecraft'), path.resolve('/games/minecraft/')]
  expect(samePath(a, b, 'linux')).toBe(false)
  expect(samePath(a, b, 'win32')).toBe(true)
  expect(samePath(a, b, 'darwin')).toBe(true)
  expect(samePath(a, path.join(a, 'x', '..'), 'linux')).toBe(true)
})

test('safeJarName', () => {
  expect(safeJarName('sodium-0.6.0.jar')).toBe('sodium-0.6.0.jar')
  expect(safeJarName('../../evil.jar')).toBe('evil.jar')
  expect(safeJarName('..\\..\\evil.jar')).toBe('evil.jar')
  expect(() => safeJarName('run.sh')).toThrow()
  expect(() => safeJarName('.hidden.jar')).toThrow()
})

describe('renameInside / moveToTrash', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-rename-'))
    await Bun.write(path.join(dir, 'mods/a.jar'), 'a')
    await Bun.write(path.join(dir, 'mods/b.jar'), 'b')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test('renames, refusing to replace or leave the base', async () => {
    await renameInside(dir, 'mods/a.jar', 'mods/a.jar.disabled')
    expect((await readdir(path.join(dir, 'mods'))).sort()).toEqual(['a.jar.disabled', 'b.jar'])
    await expect(renameInside(dir, 'mods/b.jar', 'mods/a.jar.disabled')).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(renameInside(dir, 'mods/b.jar', '../b.jar')).rejects.toThrow('outside')
  })

  test('moves a file to .mc-mod/trash with a timestamp', async () => {
    const dest = await moveToTrash(dir, path.join(dir, 'mods/a.jar'), 123)
    expect(dest).toBe(path.join(dir, '.mc-mod/trash/123-a.jar'))
    expect(await Bun.file(dest).text()).toBe('a')
    expect(await readdir(path.join(dir, 'mods'))).toEqual(['b.jar'])
  })
})
