import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rename, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeJar } from '../../test/jar'
import { hashBytes } from './hash'
import { JAR_CACHE_VERSION, scanJars } from './scan'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-scan-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const fabricJar = (id: string) =>
  makeJar({
    'fabric.mod.json': JSON.stringify({ id, version: '1.0', depends: { minecraft: '1.21.1' } }),
  })

test('lists jars and disabled jars with hashes and metadata', async () => {
  const a = fabricJar('a')
  await Bun.write(path.join(dir, 'a.jar'), a)
  await Bun.write(path.join(dir, 'b.jar.disabled'), fabricJar('b'))
  await Bun.write(path.join(dir, 'notes.txt'), 'x')
  await Bun.write(path.join(dir, 'broken.jar'), 'not a zip')

  const { jars, cache } = await scanJars(dir, undefined)
  expect(jars.map((j) => [j.fileName, j.enabled, j.meta?.id ?? null])).toEqual([
    ['a.jar', true, 'a'],
    ['b.jar.disabled', false, 'b'],
    ['broken.jar', true, null],
  ])
  expect(jars[0]).toMatchObject({ ...hashBytes(a), size: a.length })
  expect(jars[0]?.minecraft?.candidates).toContain('1.21.1')
  expect(Object.keys(cache.files).sort()).toEqual(['a.jar', 'b.jar', 'broken.jar'])
})

test('reuses cached entries while size and mtime match', async () => {
  await Bun.write(path.join(dir, 'a.jar'), fabricJar('a'))
  const first = await scanJars(dir, undefined)
  const entry = first.cache.files['a.jar']
  if (!entry) throw new Error('missing cache entry')

  // A doctored cache entry proves the file wasn't read again.
  const doctored = { ...first.cache, files: { 'a.jar': { ...entry, meta: null } } }
  expect((await scanJars(dir, doctored)).jars[0]?.meta).toBeNull()

  // Disabling keeps the entry (same size and mtime).
  await rename(path.join(dir, 'a.jar'), path.join(dir, 'a.jar.disabled'))
  expect((await scanJars(dir, doctored)).jars[0]).toMatchObject({ enabled: false, meta: null })

  // A new mtime or cache version means a fresh read.
  await utimes(path.join(dir, 'a.jar.disabled'), new Date(), new Date(2001, 1, 1))
  expect((await scanJars(dir, doctored)).jars[0]?.meta?.id).toBe('a')
  await utimes(path.join(dir, 'a.jar.disabled'), new Date(), new Date(entry.mtimeMs))
  const stale = { ...doctored, version: JAR_CACHE_VERSION - 1 }
  expect((await scanJars(dir, stale)).jars[0]?.meta?.id).toBe('a')
})

test('drops cache entries for removed files', async () => {
  await Bun.write(path.join(dir, 'a.jar'), fabricJar('a'))
  const { cache } = await scanJars(dir, undefined)
  await rm(path.join(dir, 'a.jar'))
  expect((await scanJars(dir, cache)).cache.files).toEqual({})
})

test('a missing dir is empty', async () => {
  expect((await scanJars(path.join(dir, 'nope'), undefined)).jars).toEqual([])
})
