import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hashBytes } from '../jar/hash'
import type { Fetch } from '../providers/types'
import { downloadVerified } from './download'

const bytes = new TextEncoder().encode('jar bytes'.repeat(100))
const { sha1, sha512 } = hashBytes(bytes)
const serve: Fetch = async () => new Response(bytes)
const url = 'https://cdn.modrinth.com/data/x/a.jar'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-dl-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

test('writes the file and checks both hashes', async () => {
  const file = path.join(dir, 'tmp/a.jar')
  const seen: number[] = []
  const got = await downloadVerified(
    { url, sha1, sha512, size: bytes.length, file, onProgress: (r) => seen.push(r) },
    serve,
  )
  expect(got).toEqual({ sha1, sha512, size: bytes.length })
  expect(await Bun.file(file).bytes()).toEqual(bytes)
  expect(seen.at(-1)).toBe(bytes.length)
})

test('a hash mismatch removes the partial file', async () => {
  const file = path.join(dir, 'a.jar')
  await expect(
    downloadVerified({ url, sha512: sha512.replace(/^./, '0'), file }, serve),
  ).rejects.toMatchObject({ code: 'HASH_MISMATCH' })
  expect(await readdir(dir)).toEqual([])
})

test('only allowlisted https hosts', async () => {
  for (const bad of ['http://cdn.modrinth.com/a.jar', 'https://evil.example/a.jar']) {
    await expect(
      downloadVerified({ url: bad, sha1, file: path.join(dir, 'a.jar') }, serve),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  }
})

test('a file without a hash is refused', async () => {
  await expect(
    downloadVerified({ url, file: path.join(dir, 'a.jar') }, serve),
  ).rejects.toMatchObject({ code: 'HASH_MISMATCH' })
})

test('a body far larger than announced is cut off', async () => {
  const big = new Uint8Array(8192)
  await expect(
    downloadVerified(
      { url, sha1: hashBytes(big).sha1, size: 10, file: path.join(dir, 'a.jar') },
      async () => new Response(big),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  expect(await readdir(dir)).toEqual([])
})

test('HTTP errors are provider errors', async () => {
  await expect(
    downloadVerified(
      { url, sha1, file: path.join(dir, 'a.jar') },
      async () => new Response('', { status: 503 }),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
})
