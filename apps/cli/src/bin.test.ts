import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { api, TOKEN_HEADER, TOKEN_PARAM } from '@mc-mod/shared'
import { VERSION } from './version'

const bin = path.join(import.meta.dir, 'bin.ts')
let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mc-mod-bin-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function spawn(...args: string[]) {
  return Bun.spawn(['bun', bin, ...args], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: dir, NO_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

/** Collects stdout as it arrives, so the test can wait for what the CLI printed. */
function output(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const read = async () => {
    const { value, done } = await reader.read()
    if (!done) text += decoder.decode(value, { stream: true })
    return !done
  }
  return {
    async until(pattern: RegExp) {
      while (!pattern.test(text) && (await read())) {}
      return text.match(pattern)
    },
    async rest() {
      while (await read()) {}
      return text
    },
  }
}

test('--version prints the version', async () => {
  const proc = spawn('--version')
  expect(await proc.exited).toBe(0)
  expect((await new Response(proc.stdout).text()).trim()).toBe(VERSION)
})

test('rejects an invalid port', async () => {
  const proc = spawn('--port', 'nope')
  expect(await proc.exited).not.toBe(0)
  expect(await new Response(proc.stderr).text()).toContain('--port')
})

test('fails on a missing directory', async () => {
  const proc = spawn('--dir', 'missing', '--no-open')
  expect(await proc.exited).toBe(1)
  expect(await new Response(proc.stdout).text()).toContain('Directory not found')
})

test('serves the API with a session token and stops on SIGINT', async () => {
  const proc = spawn('--no-open', '--port', '0')
  const out = output(proc.stdout)
  const match = await out.until(/http:\/\/127\.0\.0\.1:\d+\/\?t=[\w-]+/)
  expect(match).not.toBeNull()

  const url = new URL(match?.[0] ?? '')
  const token = url.searchParams.get(TOKEN_PARAM) ?? ''
  const health = await fetch(new URL('/api/health', url), { headers: { [TOKEN_HEADER]: token } })
  expect(api.health.get.response.parse(await health.json()).version).toBe(VERSION)
  expect((await fetch(new URL('/api/health', url))).status).toBe(401)

  proc.kill('SIGINT')
  expect(await proc.exited).toBe(0)
  expect(await out.rest()).toContain('Server stopped.')
})
