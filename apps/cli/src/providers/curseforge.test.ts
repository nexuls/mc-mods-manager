import { describe, expect, test } from 'bun:test'
import { AppError } from '../errors'
import {
  CurseForgeProvider,
  CurseForgeSearchForbiddenError,
  fileSide,
  splitGameVersions,
} from './curseforge'
import type { Fetch } from './types'

interface Call {
  url: string
  init?: RequestInit
}

/** A fake fetch that answers from `routes` (keyed by method and path without query) and records calls. */
function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = []
  const fetch: Fetch = async (url, init) => {
    const call = { url, init }
    calls.push(call)
    const path = new URL(url).pathname.replace('/v1', '')
    const handler = routes[`${init?.method ?? 'GET'} ${path}`]
    return handler ? handler(call) : new Response('{}', { status: 404 })
  }
  return { fetch, calls }
}

const provider = (f: { fetch: Fetch }) => new CurseForgeProvider(() => 'KEY', f.fetch)

const file = (overrides: object = {}) => ({
  id: 5001,
  modId: 238222,
  displayName: 'jei-1.21.1-neoforge-19.21.0.247.jar',
  fileName: 'jei-1.21.1-neoforge-19.21.0.247.jar',
  releaseType: 1,
  fileDate: '2026-01-01T00:00:00Z',
  fileLength: 1234,
  downloadCount: 10,
  downloadUrl: 'https://edge.forgecdn.net/files/5/1/jei.jar',
  gameVersions: ['NeoForge', '1.21.1', 'Client', 'Server', 'Java 21'],
  dependencies: [
    { modId: 1, relationType: 3 },
    { modId: 2, relationType: 2 },
    { modId: 3, relationType: 5 },
    { modId: 4, relationType: 1 },
    { modId: 5, relationType: 4 },
  ],
  hashes: [
    { value: 'MD5VALUE', algo: 2 },
    { value: 'ABCDEF', algo: 1 },
  ],
  fileFingerprint: 123456,
  extra: 'ignored',
  ...overrides,
})

const mod = (overrides: object = {}) => ({
  id: 238222,
  slug: 'jei',
  name: 'Just Enough Items (JEI)',
  summary: 'View Items and Recipes',
  classId: 6,
  links: {
    websiteUrl: 'https://www.curseforge.com/minecraft/mc-mods/jei',
    sourceUrl: 'https://github.com/mezz/JustEnoughItems',
    issuesUrl: null,
    wikiUrl: '',
  },
  logo: {
    thumbnailUrl: 'https://media.forgecdn.net/thumb.png',
    url: 'https://media.forgecdn.net/full.png',
  },
  screenshots: [
    { title: 'Shot', description: '', thumbnailUrl: 'https://t.png', url: 'https://f.png' },
  ],
  authors: [{ name: 'mezz' }],
  downloadCount: 400_000_000,
  dateModified: '2026-02-01T00:00:00Z',
  categories: [{ id: 423, name: 'Map and Information', slug: 'map-information', classId: 6 }],
  latestFilesIndexes: [
    { gameVersion: '1.21.1', modLoader: 6 },
    { gameVersion: '1.21.1', modLoader: 4 },
    { gameVersion: '1.20.1', modLoader: 1 },
  ],
  ...overrides,
})

describe('splitGameVersions', () => {
  test('keeps loaders and game versions, drops the rest', () => {
    expect(
      splitGameVersions(['NeoForge', 'Fabric', '1.21.1', '1.21', '24w14a', 'Client', 'Java 21']),
    ).toEqual({ loaders: ['neoforge', 'fabric'], gameVersions: ['1.21.1', '1.21', '24w14a'] })
  })
})

describe('fileSide', () => {
  test('maps the Client/Server tags', () => {
    expect(fileSide(['Client', '1.21.1', 'NeoForge', 'Server'])).toBe('both')
    expect(fileSide(['Client', 'Fabric', '1.21.11'])).toBe('client')
    expect(fileSide(['Server', '1.21.1'])).toBe('server')
    expect(fileSide(['NeoForge', '26.2'])).toBeUndefined()
  })
})

describe('requests', () => {
  test('send the key, and fail with PROVIDER_DISABLED without one', async () => {
    const f = fakeFetch({ 'GET /mods/238222': () => Response.json({ data: mod() }) })
    await provider(f).getProject('238222')
    expect(new Headers(f.calls[0]?.init?.headers).get('x-api-key')).toBe('KEY')
    const err = await new CurseForgeProvider(() => undefined, f.fetch)
      .getProject('238222')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).code).toBe('PROVIDER_DISABLED') // narrowed by the instanceof check above
  })

  test('a rejected key is a PROVIDER_ERROR that says so', async () => {
    const f = fakeFetch({ 'GET /mods/1': () => new Response('Forbidden', { status: 403 }) })
    expect(provider(f).getProject('1')).rejects.toThrow('rejected the API key')
  })

  test('a key that may not search gets its own message; slug lookups ask for the id', async () => {
    const f = fakeFetch({ 'GET /mods/search': () => new Response('Forbidden', { status: 403 }) })
    const q = {
      text: 'x',
      kind: 'mod' as const,
      loaders: [],
      sort: 'relevance' as const,
      offset: 0,
      limit: 5,
    }
    expect(provider(f).browse(q)).rejects.toBeInstanceOf(CurseForgeSearchForbiddenError)
    expect(provider(f).getProject('jei')).rejects.toThrow('Use the project ID')
  })

  test('a bad response is a PROVIDER_ERROR', async () => {
    const f = fakeFetch({ 'GET /mods/1': () => Response.json({ data: { id: 'x' } }) })
    expect(provider(f).getProject('1')).rejects.toThrow('Unexpected response')
  })
})

describe('testKey', () => {
  test('ok for 200, a message for a rejected key', async () => {
    const ok = fakeFetch({ 'GET /games/432': () => Response.json({ data: {} }) })
    expect(await provider(ok).testKey('K')).toEqual({ ok: true, message: 'The key works.' })
    expect(new Headers(ok.calls[0]?.init?.headers).get('x-api-key')).toBe('K')
    const bad = fakeFetch({ 'GET /games/432': () => new Response('', { status: 403 }) })
    expect((await provider(bad).testKey('K')).ok).toBe(false)
  })

  test('says when a working key may not search', async () => {
    const f = fakeFetch({
      'GET /games/432': () => Response.json({ data: {} }),
      'GET /mods/search': () => new Response('', { status: 403 }),
    })
    const res = await provider(f).testKey('K')
    expect(res.ok).toBe(true)
    expect(res.message).toContain("doesn't let it search")
  })
})

describe('identify', () => {
  test('posts fingerprints and maps exact matches by fingerprint', async () => {
    const f = fakeFetch({
      'POST /fingerprints/432': () =>
        Response.json({ data: { exactMatches: [{ id: 238222, file: file() }] } }),
    })
    const matches = await provider(f).identify([123456, 99, 123456])
    expect(matches.get(123456)).toEqual({
      projectId: '238222',
      versionId: '5001',
      versionNumber: 'jei-1.21.1-neoforge-19.21.0.247.jar',
      loaders: ['neoforge'],
      gameVersions: ['1.21.1'],
      side: 'both',
    })
    expect(matches.has(99)).toBe(false)
    expect(JSON.parse(String(f.calls[0]?.init?.body))).toEqual({ fingerprints: [123456, 99] })
  })
})

describe('projects', () => {
  test('bulk mods skip non-numeric ids', async () => {
    const f = fakeFetch({ 'POST /mods': () => Response.json({ data: [mod()] }) })
    const map = await provider(f).getProjects(['238222', 'sodium'])
    expect(map.get('238222')).toMatchObject({ slug: 'jei', title: 'Just Enough Items (JEI)' })
    expect(JSON.parse(String(f.calls[0]?.init?.body))).toEqual({ modIds: [238222] })
  })

  test('a slug is looked up with search in the content class', async () => {
    const f = fakeFetch({
      'GET /mods/search': () => Response.json({ data: [mod()], pagination: page(1) }),
    })
    expect((await provider(f).getProject('jei'))?.id).toBe('238222')
    const url = new URL(f.calls[0]?.url ?? '')
    expect(url.searchParams.get('slug')).toBe('jei')
    expect(url.searchParams.get('classId')).toBe('6')
  })

  test('an unknown id is null', async () => {
    const f = fakeFetch({})
    expect(await provider(f).getProject('42')).toBeNull()
  })

  test('the project page has the HTML body, links and screenshots', async () => {
    const f = fakeFetch({
      'GET /mods/238222': () => Response.json({ data: mod() }),
      'GET /mods/238222/description': () => Response.json({ data: '<p>Hi</p>' }),
    })
    const p = await provider(f).getProjectPage('238222')
    expect(p).toMatchObject({
      provider: 'curseforge',
      id: '238222',
      body: '<p>Hi</p>',
      iconUrl: 'https://media.forgecdn.net/thumb.png',
      pageUrl: 'https://www.curseforge.com/minecraft/mc-mods/jei',
      links: [{ label: 'Source', url: 'https://github.com/mezz/JustEnoughItems' }],
      gallery: [{ url: 'https://t.png', rawUrl: 'https://f.png', title: 'Shot' }],
      categories: ['map-information'],
      loaders: ['neoforge', 'fabric', 'forge'],
      gameVersions: ['1.21.1', '1.20.1'],
      side: 'unknown',
    })
  })
})

const page = (totalCount: number, index = 0) => ({
  index,
  pageSize: 50,
  resultCount: totalCount,
  totalCount,
})

describe('versions', () => {
  test('maps files and sends a single game version and loader as filters', async () => {
    const f = fakeFetch({
      'GET /mods/238222': () => Response.json({ data: mod() }),
      'GET /mods/238222/files': () => Response.json({ data: [file()], pagination: page(1) }),
    })
    const [v] =
      (await provider(f).getVersions('238222', {
        loaders: ['neoforge'],
        gameVersions: ['1.21.1'],
      })) ?? []
    expect(v).toEqual({
      provider: 'curseforge',
      id: '5001',
      projectId: '238222',
      name: 'jei-1.21.1-neoforge-19.21.0.247.jar',
      versionNumber: 'jei-1.21.1-neoforge-19.21.0.247.jar',
      type: 'release',
      publishedAt: '2026-01-01T00:00:00Z',
      downloads: 10,
      loaders: ['neoforge'],
      gameVersions: ['1.21.1'],
      side: 'both',
      file: {
        name: 'jei-1.21.1-neoforge-19.21.0.247.jar',
        url: 'https://edge.forgecdn.net/files/5/1/jei.jar',
        size: 1234,
        sha1: 'abcdef',
      },
      dependencies: [
        { projectId: '1', type: 'required' },
        { projectId: '2', type: 'optional' },
        { projectId: '3', type: 'incompatible' },
        { projectId: '4', type: 'embedded' },
        { projectId: '5', type: 'embedded' },
      ],
      pageUrl: 'https://www.curseforge.com/minecraft/mc-mods/jei/files/5001',
    })
    const url = new URL(f.calls[1]?.url ?? '')
    expect(url.searchParams.get('gameVersion')).toBe('1.21.1')
    expect(url.searchParams.get('modLoaderType')).toBe('6')
  })

  test('several loaders are filtered by the caller, not CurseForge', async () => {
    const f = fakeFetch({
      'GET /mods/238222': () => Response.json({ data: mod() }),
      'GET /mods/238222/files': () => Response.json({ data: [], pagination: page(0) }),
    })
    await provider(f).getVersions('238222', { loaders: ['neoforge', 'forge'] })
    expect(new URL(f.calls[1]?.url ?? '').searchParams.has('modLoaderType')).toBe(false)
  })

  test('pages through files', async () => {
    const f = fakeFetch({
      'GET /mods/238222': () => Response.json({ data: mod() }),
      'GET /mods/238222/files': (c) => {
        const index = Number(new URL(c.url).searchParams.get('index'))
        const data = Array.from({ length: index === 0 ? 50 : 3 }, (_, i) => file({ id: index + i }))
        return Response.json({ data, pagination: page(53, index) })
      },
    })
    expect(await provider(f).getVersions('238222')).toHaveLength(53)
  })

  test('no download URL (third-party distribution off) leaves the file URL null', async () => {
    const f = fakeFetch({
      'POST /mods/files': () => Response.json({ data: [file({ downloadUrl: null })] }),
      'POST /mods': () => Response.json({ data: [mod()] }),
    })
    const v = (await provider(f).getVersionsByIds(['5001', 'abc'])).get('5001')
    expect(v?.file?.url).toBeNull()
    expect(v?.pageUrl).toBe('https://www.curseforge.com/minecraft/mc-mods/jei/files/5001')
    expect(JSON.parse(String(f.calls[0]?.init?.body))).toEqual({ fileIds: [5001] })
  })

  test('plugin files without a loader count as Bukkit', async () => {
    const f = fakeFetch({
      'POST /mods/files': () => Response.json({ data: [file({ gameVersions: ['1.21'] })] }),
      'POST /mods': () => Response.json({ data: [mod({ classId: 5 })] }),
    })
    expect((await provider(f).getVersionsByIds(['5001'])).get('5001')?.loaders).toEqual(['bukkit'])
  })
})

describe('browse', () => {
  const search = () =>
    fakeFetch({
      'GET /mods/search': () => Response.json({ data: [mod()], pagination: page(20_000) }),
      'GET /categories': () =>
        Response.json({
          data: [
            { id: 423, name: 'Map and Information', slug: 'map-information', classId: 6 },
            { id: 6, name: 'Mods', slug: 'mc-mods', isClass: true },
          ],
        }),
    })
  const query = {
    text: 'jei',
    kind: 'mod' as const,
    loaders: ['quilt', 'fabric'] as const,
    gameVersion: '1.21.1',
    sort: 'downloads' as const,
    offset: 20,
    limit: 20,
  }

  test('maps the query and the hits; totals are capped at what can be paged', async () => {
    const f = search()
    const res = await provider(f).browse({ ...query, category: 'map-information' })
    expect(res.total).toBe(10_000)
    expect(res.hits[0]).toMatchObject({
      provider: 'curseforge',
      id: '238222',
      author: 'mezz',
      categories: ['map-information', 'neoforge', 'fabric', 'forge'],
    })
    const url = new URL(f.calls.find((c) => c.url.includes('/mods/search'))?.url ?? '')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      gameId: '432',
      classId: '6',
      sortField: '6',
      sortOrder: 'desc',
      index: '20',
      pageSize: '20',
      searchFilter: 'jei',
      gameVersion: '1.21.1',
      modLoaderTypes: '[5,4]',
      categoryId: '423',
    })
  })

  test('an unknown category finds nothing', async () => {
    expect((await provider(search()).browse({ ...query, category: 'nope' })).hits).toEqual([])
  })

  test('plugins use the Bukkit class and no loader filter', async () => {
    const f = search()
    await provider(f).browse({ ...query, kind: 'plugin', loaders: ['paper', 'spigot'] })
    const url = new URL(f.calls[0]?.url ?? '')
    expect(url.searchParams.get('classId')).toBe('5')
    expect(url.searchParams.has('modLoaderTypes')).toBe(false)
  })

  test('categories leave out classes', async () => {
    expect(await provider(search()).categories('mod')).toEqual([
      { name: 'map-information', label: 'Map and Information' },
    ])
  })
})

// Hits the real API. Run with MC_MOD_LIVE=1 and CURSEFORGE_API_KEY set.
test.if(process.env.MC_MOD_LIVE === '1' && Boolean(process.env.CURSEFORGE_API_KEY))(
  'live: finds JEI and its files',
  async () => {
    const p = new CurseForgeProvider(() => process.env.CURSEFORGE_API_KEY)
    expect((await p.testKey(process.env.CURSEFORGE_API_KEY ?? '')).ok).toBe(true)
    expect((await p.getProject('238222'))?.slug).toBe('jei')
    const page = await p.getProjectPage('238222')
    expect(page?.body.length).toBeGreaterThan(0)
    const versions = await p.getVersions('238222', {
      loaders: ['neoforge'],
      gameVersions: ['1.21.1'],
    })
    expect(versions?.[0]?.loaders).toContain('neoforge')
    const fp = versions?.[0] ? await p.getVersionsByIds([versions[0].id]) : new Map()
    expect(fp.size).toBe(1)
    expect((await p.categories('mod')).length).toBeGreaterThan(5)
    // Some keys may not search (CurseForgeSearchForbiddenError); check search only where it's allowed.
    const slugs = await p
      .browse({
        text: 'jei',
        kind: 'mod',
        loaders: ['neoforge'],
        gameVersion: '1.21.1',
        sort: 'relevance',
        offset: 0,
        limit: 5,
      })
      .then((r) => r.hits.map((h) => h.slug))
      .catch((err: unknown) => {
        if (err instanceof CurseForgeSearchForbiddenError) return ['jei']
        throw err
      })
    expect(slugs).toContain('jei')
  },
  30_000,
)
