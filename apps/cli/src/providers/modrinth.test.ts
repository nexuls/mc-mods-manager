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
  name: 'Version 1',
  version_number: '1.0.0',
  version_type: 'release',
  date_published: '2026-01-01T00:00:00Z',
  downloads: 5,
  loaders: ['fabric'],
  game_versions: ['1.21.1'],
  environment: 'client_only',
  files: [
    {
      filename: 'a.jar',
      url: 'https://cdn.modrinth.com/a.jar',
      size: 10,
      primary: true,
      hashes: { sha1: 'aa', sha512: 'bb' },
    },
  ],
  dependencies: [{ project_id: 'DEP', version_id: null, dependency_type: 'required' }],
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

describe('browse', () => {
  const hit = {
    project_id: 'P',
    slug: 'p',
    title: 'P',
    downloads: 3,
    display_categories: ['fabric', 'optimization'],
    environment: ['client_only'],
  }

  test('sends loaders OR-ed, version and category as facets', async () => {
    const f = fakeFetch({
      '/search': () => Response.json({ hits: [hit], offset: 20, limit: 20, total_hits: 41 }),
    })
    const res = await new ModrinthProvider(f.fetch).browse({
      text: 'x',
      kind: 'mod',
      loaders: ['quilt', 'fabric'],
      gameVersion: '1.21.1',
      category: 'optimization',
      sort: 'downloads',
      offset: 20,
      limit: 20,
    })
    expect(res).toEqual({
      total: 41,
      hits: [
        {
          provider: 'modrinth',
          id: 'P',
          slug: 'p',
          title: 'P',
          description: '',
          downloads: 3,
          categories: ['fabric', 'optimization'],
          side: 'client',
          iconUrl: undefined,
          author: undefined,
          follows: undefined,
          updatedAt: undefined,
        },
      ],
    })
    const params = new URL(f.calls[0]?.url ?? '').searchParams
    expect(JSON.parse(params.get('facets') ?? '')).toEqual([
      ['project_type:mod'],
      ['categories:quilt', 'categories:fabric'],
      ['versions:1.21.1'],
      ['categories:optimization'],
    ])
    expect(params.get('index')).toBe('downloads')
    expect(params.get('offset')).toBe('20')
  })

  test('reuses a cached search', async () => {
    const f = fakeFetch({
      '/search': () => Response.json({ hits: [], offset: 0, limit: 5, total_hits: 0 }),
    })
    const p = new ModrinthProvider(f.fetch)
    const q = {
      text: 'a',
      kind: 'mod',
      loaders: [],
      sort: 'relevance',
      offset: 0,
      limit: 5,
    } as const
    await p.browse(q)
    await p.browse(q)
    expect(f.calls).toHaveLength(1)
  })
})

describe('versions', () => {
  test('getVersions filters and normalizes', async () => {
    const f = fakeFetch({ '/project/sodium/version': () => Response.json([version()]) })
    const list = await new ModrinthProvider(f.fetch).getVersions('sodium', {
      loaders: ['fabric', 'quilt'],
      gameVersions: ['1.21.1'],
    })
    expect(list).toEqual([
      {
        provider: 'modrinth',
        id: 'VER1',
        projectId: 'PROJ1',
        name: 'Version 1',
        versionNumber: '1.0.0',
        type: 'release',
        publishedAt: '2026-01-01T00:00:00Z',
        downloads: 5,
        loaders: ['fabric'],
        gameVersions: ['1.21.1'],
        side: 'client',
        file: {
          name: 'a.jar',
          url: 'https://cdn.modrinth.com/a.jar',
          size: 10,
          sha1: 'aa',
          sha512: 'bb',
        },
        dependencies: [{ projectId: 'DEP', versionId: undefined, type: 'required' }],
      },
    ])
    const params = new URL(f.calls[0]?.url ?? '').searchParams
    expect(params.get('loaders')).toBe('["fabric","quilt"]')
    expect(params.get('game_versions')).toBe('["1.21.1"]')
  })

  test('a version without a jar has no file', async () => {
    const f = fakeFetch({
      '/project/x/version': () =>
        Response.json([
          version({
            files: [{ filename: 'a.zip', url: 'u', size: 1, primary: true, hashes: {} }],
          }),
        ]),
    })
    expect((await new ModrinthProvider(f.fetch).getVersions('x'))?.[0]?.file).toBeNull()
  })

  test('getVersions of an unknown project is null', async () => {
    expect(await new ModrinthProvider(fakeFetch({}).fetch).getVersions('nope')).toBeNull()
  })
})

describe('getProjectPage', () => {
  const page = (license: object | null) =>
    fakeFetch({
      '/project/p': () =>
        Response.json({
          id: 'P',
          slug: 'p',
          title: 'P',
          project_type: 'mod',
          license,
          source_url: 'https://github.com/x/p',
          issues_url: null,
          gallery: [
            { url: 'b', ordering: 2, title: '' },
            { url: 'a', ordering: 1, title: 'First' },
          ],
        }),
    })

  test('links, gallery order and license', async () => {
    const p = await new ModrinthProvider(
      page({ id: 'MIT', name: 'MIT License' }).fetch,
    ).getProjectPage('p')
    expect(p).toMatchObject({
      license: 'MIT License',
      pageUrl: 'https://modrinth.com/project/p',
      links: [{ label: 'Source', url: 'https://github.com/x/p' }],
      gallery: [
        { url: 'a', title: 'First' },
        { url: 'b', title: undefined },
      ],
    })
  })

  test.each([
    [{ id: 'LicenseRef-Custom', name: '' }, 'Custom license'],
    [{ id: 'Apache-2.0', name: '' }, 'Apache-2.0'],
    [null, undefined],
  ])('license %j → %p', async (license, label) => {
    const p = await new ModrinthProvider(page(license).fetch).getProjectPage('p')
    expect(p?.license).toBe(label)
  })
})

describe('tags', () => {
  test('gameVersions leaves snapshots out unless asked', async () => {
    const f = fakeFetch({
      '/tag/game_version': () =>
        Response.json([
          { version: '1.21.2', version_type: 'release', date: 'd' },
          { version: '24w14a', version_type: 'snapshot', date: 'd' },
        ]),
    })
    const p = new ModrinthProvider(f.fetch)
    expect(await p.gameVersions(false)).toEqual(['1.21.2'])
    expect(await p.gameVersions(true)).toEqual(['1.21.2', '24w14a'])
    expect(f.calls).toHaveLength(1)
  })

  test('categories of one kind, labelled and sorted', async () => {
    const f = fakeFetch({
      '/tag/category': () =>
        Response.json([
          { name: 'worldgen', project_type: 'mod', header: 'categories' },
          { name: 'game-mechanics', project_type: 'mod', header: 'categories' },
          { name: '16x', project_type: 'resourcepack', header: 'resolutions' },
          { name: 'economy', project_type: 'plugin', header: 'categories' },
        ]),
    })
    expect(await new ModrinthProvider(f.fetch).categories('mod')).toEqual([
      { name: 'game-mechanics', label: 'Game mechanics' },
      { name: 'worldgen', label: 'Worldgen' },
    ])
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
  const page = await p.getProjectPage('sodium')
  expect(page?.body.length).toBeGreaterThan(0)
  const versions = await p.getVersions('sodium', { loaders: ['fabric'], gameVersions: ['1.21.1'] })
  expect(versions?.[0]?.file?.url).toStartWith('https://cdn.modrinth.com/')
  expect(await p.gameVersions(false)).toContain('1.21.1')
  expect((await p.categories('mod')).map((c) => c.name)).toContain('optimization')
})
