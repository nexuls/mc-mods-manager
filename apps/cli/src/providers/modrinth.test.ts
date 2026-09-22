import { describe, expect, test } from 'bun:test'
import { AppError } from '../errors'
import { ModrinthProvider, projectSide, USER_AGENT } from './modrinth'
import { MrProject } from './modrinth.schemas'
import type { Fetch } from './types'

interface Call {
  url: string
  init?: RequestInit
}

/** A fake fetch that answers from `routes` (keyed by path without query) and records calls. */
function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = []
  const fetch: Fetch = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    const path = new URL(url).pathname.replace('/v2', '')
    const handler = routes[path]
    return handler ? handler(call) : new Response('{}', { status: 404 })
  }
  return { fetch, calls }
}

const version = (overrides: object = {}) => ({
  id: 'VER1',
  project_id: 'PROJ1',
  version_number: '1.0.0',
  loaders: ['fabric'],
  game_versions: ['1.21.1'],
  environment: 'client_only',
  files: [{ filename: 'a.jar', primary: true, hashes: { sha1: 'aa', sha512: 'bb' } }],
  extra: 'ignored',
  ...overrides,
})

describe('identify', () => {
  test('posts sha1 hashes with the User-Agent and maps matches', async () => {
    const f = fakeFetch({ '/version_files': () => Response.json({ AA: version() }) })
    const matches = await new ModrinthProvider(f.fetch).identify(['aa', 'bb', 'aa'])
    expect(matches.get('aa')).toEqual({
      projectId: 'PROJ1',
      versionId: 'VER1',
      versionNumber: '1.0.0',
      loaders: ['fabric'],
      gameVersions: ['1.21.1'],
      side: 'client',
    })
    expect(matches.has('bb')).toBe(false)
    const [call] = f.calls
    expect(call?.init?.method).toBe('POST')
    expect(new Headers(call?.init?.headers).get('User-Agent')).toBe(USER_AGENT)
    expect(JSON.parse(String(call?.init?.body))).toEqual({
      hashes: ['aa', 'bb'],
      algorithm: 'sha1',
    })
  })

  test('an unknown environment value is not a side', async () => {
    const f = fakeFetch({
      '/version_files': () => Response.json({ aa: version({ environment: 'something_new' }) }),
    })
    expect((await new ModrinthProvider(f.fetch).identify(['aa'])).get('aa')?.side).toBeUndefined()
  })

  test('a bad response is a PROVIDER_ERROR', async () => {
    const f = fakeFetch({ '/version_files': () => Response.json({ aa: { id: 1 } }) })
    const err = await new ModrinthProvider(f.fetch).identify(['aa']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  test('a network failure is a PROVIDER_ERROR', async () => {
    const p = new ModrinthProvider(async () => {
      throw new TypeError('offline')
    })
    await expect(p.identify(['aa'])).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  test('a long rate-limit wait is reported', async () => {
    const f = fakeFetch({
      '/version_files': () =>
        new Response('', { status: 429, headers: { 'X-Ratelimit-Reset': '60' } }),
    })
    await expect(new ModrinthProvider(f.fetch).identify(['aa'])).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })
})

describe('projects', () => {
  const project = { id: 'PROJ1', slug: 'sodium', title: 'Sodium', project_type: 'mod' }

  test('getProjects sends ids as a JSON array', async () => {
    const f = fakeFetch({ '/projects': () => Response.json([project]) })
    const map = await new ModrinthProvider(f.fetch).getProjects(['PROJ1'])
    expect(map.get('PROJ1')).toMatchObject({ slug: 'sodium', side: 'unknown' })
    expect(new URL(f.calls[0]?.url ?? '').searchParams.get('ids')).toBe('["PROJ1"]')
  })

  test('getProject returns null on 404', async () => {
    const f = fakeFetch({})
    expect(await new ModrinthProvider(f.fetch).getProject('nope')).toBeNull()
  })
})

describe('projectSide', () => {
  const p = (x: object) =>
    MrProject.parse({ id: 'a', slug: 'a', title: 'A', project_type: 'mod', ...x })

  test.each([
    [{ environment: ['client_only'] }, 'client'],
    [{ environment: ['server_only'] }, 'server'],
    [{ environment: ['client_only', 'server_only'] }, 'both'],
    [{ client_side: 'required', server_side: 'unsupported' }, 'client'],
    [{ client_side: 'unsupported', server_side: 'required' }, 'server'],
    [{ client_side: 'optional', server_side: 'optional' }, 'both'],
    [{ client_side: 'unknown', server_side: 'required' }, 'unknown'],
  ] as const)('%j → %s', (x, side) => {
    expect(projectSide(p(x))).toBe(side)
  })
})

// Hits the real API. Run with MC_MOD_LIVE=1 to check that the schemas still match Modrinth.
test.if(process.env.MC_MOD_LIVE === '1')('live: identifies a known Sodium jar', async () => {
  const p = new ModrinthProvider()
  const sha1 = '003c114c85ca88ef3362e018deb6aca0c682d6a1' // sodium-fabric-0.8.13+mc1.21.1.jar
  const match = (await p.identify([sha1])).get(sha1)
  expect(match).toMatchObject({ projectId: 'AANobbMI', side: 'client' })
  expect((await p.getProjects(['AANobbMI'])).get('AANobbMI')?.slug).toBe('sodium')
  expect(
    (await p.search({ text: 'sodium', kind: 'mod', loader: 'fabric', limit: 3 }))[0]?.slug,
  ).toBe('sodium')
})
