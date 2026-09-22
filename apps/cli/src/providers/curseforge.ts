import {
  type Category,
  type ContentKind,
  type DependencyType,
  Loader,
  type Project,
  type ProjectHit,
  type ProjectLink,
  type ProjectVersion,
  type SearchSort,
  type VersionType,
} from '@mc-mod/shared'
import { z } from 'zod'
import { AppError } from '../errors'
import { TtlCache } from '../lib/ttl-cache'
import {
  CfCategoriesResponse,
  type CfCategory,
  CfDescriptionResponse,
  type CfFile,
  CfFilesResponse,
  CfFingerprintResponse,
  type CfMod,
  CfModResponse,
  CfModsResponse,
  CfSearchResponse,
  HASH_SHA1,
} from './curseforge.schemas'
import type { BrowseQuery } from './modrinth'
import type { Fetch, HashMatch, ProjectInfo } from './types'

export const CURSEFORGE_API = 'https://api.curseforge.com/v1'

/** Minecraft's game id on CurseForge. */
export const MINECRAFT = 432

/** Content classes: Mods and Bukkit Plugins. */
const CLASS_ID: Record<ContentKind, number> = { mod: 6, plugin: 5 }
/** Path segment of a class on curseforge.com, for page links the API doesn't give. */
const CLASS_PATH: Record<number, string> = { 6: 'mc-mods', 5: 'bukkit-plugins' }

/** `modLoaderType` for the loaders CurseForge knows (0 Any, 2 Cauldron and 3 LiteLoader aren't ours). */
const LOADER_TYPE: Partial<Record<Loader, number>> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const TYPE_LOADER = new Map(Object.entries(LOADER_TYPE).map(([l, t]) => [t, l]))

/** `sortField`: 2 Popularity, 3 LastUpdated, 6 TotalDownloads, 11 ReleasedDate, 12 Rating. */
const SORT_FIELD: Record<SearchSort, number> = {
  relevance: 2,
  downloads: 6,
  follows: 12,
  newest: 11,
  updated: 3,
}

const RELEASE_TYPE: Record<number, VersionType> = { 1: 'release', 2: 'beta', 3: 'alpha' }
const RELATION: Record<number, DependencyType> = { 2: 'optional', 3: 'required', 5: 'incompatible' }

const TIMEOUT_MS = 15_000
const FINGERPRINT_BATCH = 500
const ID_BATCH = 100
/** The API's page size limit, and the furthest a search or file list can page (`index + pageSize`). */
const PAGE_SIZE = 50
const MAX_INDEX = 10_000
/** Files fetched for one project at most (newest first); enough for any version dropdown. */
const MAX_FILES = 500

const TTL = { search: 2 * 60_000, project: 10 * 60_000, versions: 5 * 60_000, tags: 24 * 3600_000 }

const isNumericId = (s: string) => /^\d{1,10}$/.test(s)

/** `1.21.1`, `1.21`, `1.21-pre1`, `24w14a`: the game-version entries of a file's `gameVersions`. */
const GAME_VERSION = /^(\d+\.\d+(\.\d+)?(-(pre|rc)\d+)?|\d{2}w\d{2}[a-z])$/i

/** Splits a file's `gameVersions` into our loaders and game versions; "Client", "Java 21" etc. go. */
export function splitGameVersions(list: readonly string[]): {
  loaders: Loader[]
  gameVersions: string[]
} {
  const loaders: Loader[] = []
  const gameVersions: string[] = []
  for (const entry of list) {
    const loader = Loader.safeParse(entry.toLowerCase())
    if (loader.success && loader.data !== 'vanilla') loaders.push(loader.data)
    else if (GAME_VERSION.test(entry)) gameVersions.push(entry)
  }
  return { loaders, gameVersions }
}

function pageUrl(mod: Pick<CfMod, 'id' | 'slug' | 'classId' | 'links'>): string {
  const site = mod.links?.websiteUrl
  if (site) return site.replace(/\/$/, '')
  const cls = mod.classId ? CLASS_PATH[mod.classId] : undefined
  return cls
    ? `https://www.curseforge.com/minecraft/${cls}/${mod.slug}`
    : `https://www.curseforge.com/projects/${mod.id}`
}

const iconOf = (m: CfMod) => m.logo?.thumbnailUrl || m.logo?.url || undefined

function toProject(m: CfMod): ProjectInfo {
  return {
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    iconUrl: iconOf(m),
    author: m.authors[0]?.name,
    downloads: m.downloadCount,
    // CurseForge has no reliable side information.
    side: 'unknown',
  }
}

/** Loaders the project has files for, from its latest-files index. */
function modLoaders(m: CfMod): Loader[] {
  const out = new Set<Loader>()
  for (const f of m.latestFilesIndexes) {
    const l = f.modLoader == null ? undefined : TYPE_LOADER.get(f.modLoader)
    const parsed = Loader.safeParse(l)
    if (parsed.success) out.add(parsed.data)
  }
  if (m.classId === CLASS_ID.plugin) out.add('bukkit')
  return [...out]
}

function toHit(m: CfMod): ProjectHit {
  return {
    provider: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    iconUrl: iconOf(m),
    author: m.authors[0]?.name,
    downloads: m.downloadCount,
    updatedAt: m.dateModified,
    // Category slugs, then loaders (Browse shows loaders only in the "+N" tooltip).
    categories: [...m.categories.filter((c) => !c.isClass).map((c) => c.slug), ...modLoaders(m)],
    side: 'unknown',
  }
}

function toProjectPage(m: CfMod, body: string): Project {
  const links: ProjectLink[] = []
  const add = (label: string, url: string | null | undefined) => {
    if (url) links.push({ label, url })
  }
  add('Source', m.links?.sourceUrl)
  add('Issues', m.links?.issuesUrl)
  add('Wiki', m.links?.wikiUrl)
  return {
    provider: 'curseforge',
    id: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    body,
    iconUrl: iconOf(m),
    downloads: m.downloadCount,
    updatedAt: m.dateModified,
    categories: m.categories.filter((c) => !c.isClass).map((c) => c.slug),
    loaders: modLoaders(m),
    gameVersions: [...new Set(m.latestFilesIndexes.map((f) => f.gameVersion))],
    side: 'unknown',
    pageUrl: pageUrl(m),
    links,
    gallery: m.screenshots.flatMap((s) => {
      const url = s.thumbnailUrl || s.url
      if (!url) return []
      return [
        {
          url,
          rawUrl: s.url || undefined,
          title: s.title || undefined,
          description: s.description || undefined,
        },
      ]
    }),
  }
}

/**
 * A CurseForge file as a version. `mod` gives the page link for manual downloads and tells plugin
 * files (whose loader metadata is poor) apart: a plugin file without a loader counts as Bukkit.
 */
export function toVersion(f: CfFile, mod?: Pick<CfMod, 'id' | 'slug' | 'classId' | 'links'>) {
  const { loaders, gameVersions } = splitGameVersions(f.gameVersions)
  if (loaders.length === 0 && mod?.classId === CLASS_ID.plugin) loaders.push('bukkit')
  const sha1 = f.hashes.find((h) => h.algo === HASH_SHA1)?.value.toLowerCase()
  const version: ProjectVersion = {
    provider: 'curseforge',
    id: String(f.id),
    projectId: String(f.modId),
    name: f.displayName,
    versionNumber: f.displayName,
    type: RELEASE_TYPE[f.releaseType] ?? 'alpha',
    publishedAt: f.fileDate,
    downloads: f.downloadCount,
    loaders,
    gameVersions,
    file: f.fileName.toLowerCase().endsWith('.jar')
      ? { name: f.fileName, url: f.downloadUrl ?? null, size: f.fileLength, sha1 }
      : null,
    dependencies: f.dependencies.map((d) => ({
      projectId: String(d.modId),
      // Tools (4) and included/embedded libraries (1, 6) aren't installed separately.
      type: RELATION[d.relationType] ?? 'embedded',
    })),
    pageUrl: mod ? `${pageUrl(mod)}/files/${f.id}` : undefined,
  }
  return version
}

function toMatch(f: CfFile): HashMatch {
  return {
    projectId: String(f.modId),
    versionId: String(f.id),
    versionNumber: f.displayName,
    ...splitGameVersions(f.gameVersions),
  }
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** `modLoaderType`s for a set of our loaders; plugin loaders have none. */
function loaderTypes(loaders: readonly string[]): number[] {
  return [
    ...new Set(
      loaders.flatMap((l) => {
        const parsed = Loader.safeParse(l)
        const t = parsed.success ? LOADER_TYPE[parsed.data] : undefined
        return t === undefined ? [] : [t]
      }),
    ),
  ]
}

/**
 * CurseForge API client. Every call needs the user's API key, read through `getKey` so a key saved in
 * Settings applies right away. The key is only ever sent to api.curseforge.com.
 */
export class CurseForgeProvider {
  private readonly cache = new TtlCache()

  constructor(
    private readonly getKey: () => string | undefined,
    private readonly fetch: Fetch = (url, init) => globalThis.fetch(url, init),
  ) {}

  enabled(): boolean {
    return Boolean(this.getKey())
  }

  /** Checks a key with a cheap request. Never throws for a rejected key. */
  async testKey(key: string): Promise<{ ok: boolean; message: string }> {
    let res: Response
    try {
      res = await this.fetch(`${CURSEFORGE_API}/games/${MINECRAFT}`, {
        headers: { 'x-api-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      return { ok: false, message: `Can't reach CurseForge: ${String(err)}` }
    }
    if (res.ok) return { ok: true, message: 'The key works.' }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'CurseForge rejected this key.' }
    }
    return { ok: false, message: `CurseForge returned HTTP ${res.status}.` }
  }

  /** Exact-file lookup by murmur2 fingerprint. Unknown fingerprints are missing from the map. */
  async identify(fingerprints: readonly number[]): Promise<Map<number, HashMatch>> {
    const out = new Map<number, HashMatch>()
    for (const batch of chunks([...new Set(fingerprints)], FINGERPRINT_BATCH)) {
      const res = await this.request(`/fingerprints/${MINECRAFT}`, CfFingerprintResponse, {
        method: 'POST',
        body: JSON.stringify({ fingerprints: batch }),
      })
      for (const m of res.data.exactMatches) out.set(m.file.fileFingerprint, toMatch(m.file))
    }
    return out
  }

  /** Mods by id; ids CurseForge doesn't know (or that aren't numeric) are missing from the map. */
  async getProjects(ids: readonly string[]): Promise<Map<string, ProjectInfo>> {
    const out = new Map<string, ProjectInfo>()
    for (const m of await this.getMods(ids)) out.set(String(m.id), toProject(m))
    return out
  }

  /** A mod by id, or by slug within a content kind. Null if CurseForge doesn't have it. */
  async getProject(idOrSlug: string, kind: ContentKind = 'mod'): Promise<ProjectInfo | null> {
    const m = await this.fetchMod(idOrSlug, kind)
    return m ? toProject(m) : null
  }

  /** The full project for its page (HTML description, links, screenshots). */
  async getProjectPage(idOrSlug: string, kind: ContentKind = 'mod'): Promise<Project | null> {
    const m = await this.fetchMod(idOrSlug, kind)
    if (!m) return null
    const body = await this.request(
      `/mods/${m.id}/description`,
      CfDescriptionResponse,
      {},
      {
        ttlMs: TTL.project,
        notFound: { data: '' },
      },
    )
    return toProjectPage(m, body.data)
  }

  /**
   * A mod's files, newest first. CurseForge filters on one game version and one loader, so a filter with
   * several of either is left to the caller (version ranking checks every file anyway).
   */
  async getVersions(
    idOrSlug: string,
    filter: { loaders?: readonly string[]; gameVersions?: readonly string[] } = {},
    kind: ContentKind = 'mod',
  ): Promise<ProjectVersion[] | null> {
    const mod = await this.fetchMod(idOrSlug, kind)
    if (!mod) return null
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) })
    const [gameVersion] = filter.gameVersions ?? []
    if (gameVersion && filter.gameVersions?.length === 1) params.set('gameVersion', gameVersion)
    const types = loaderTypes(filter.loaders ?? [])
    const [type] = types
    if (type !== undefined && types.length === 1) params.set('modLoaderType', String(type))

    const files: CfFile[] = []
    for (let index = 0; index < MAX_FILES; index += PAGE_SIZE) {
      params.set('index', String(index))
      const page = await this.request(
        `/mods/${mod.id}/files?${params}`,
        CfFilesResponse,
        {},
        {
          ttlMs: TTL.versions,
        },
      )
      files.push(...page.data)
      const total = page.pagination?.totalCount ?? 0
      if (page.data.length < PAGE_SIZE || files.length >= total) break
    }
    return files.map((f) => toVersion(f, mod))
  }

  /** Files by id; ids CurseForge doesn't know are missing from the map. */
  async getVersionsByIds(ids: readonly string[]): Promise<Map<string, ProjectVersion>> {
    const numeric = [...new Set(ids)].filter(isNumericId)
    const files: CfFile[] = []
    for (const batch of chunks(numeric, ID_BATCH)) {
      const res = await this.request('/mods/files', CfFilesResponse, {
        method: 'POST',
        body: JSON.stringify({ fileIds: batch.map(Number) }),
      })
      files.push(...res.data)
    }
    const mods = new Map(
      (await this.getMods(files.map((f) => String(f.modId)))).map((m) => [m.id, m]),
    )
    return new Map(files.map((f) => [String(f.id), toVersion(f, mods.get(f.modId))]))
  }

  /** Project search for Browse. */
  async browse(q: BrowseQuery): Promise<{ hits: ProjectHit[]; total: number }> {
    const limit = Math.min(q.limit, PAGE_SIZE, MAX_INDEX - q.offset)
    if (limit <= 0) return { hits: [], total: MAX_INDEX }
    const params = new URLSearchParams({
      gameId: String(MINECRAFT),
      classId: String(CLASS_ID[q.kind]),
      sortField: String(SORT_FIELD[q.sort]),
      sortOrder: 'desc',
      index: String(q.offset),
      pageSize: String(limit),
    })
    if (q.text) params.set('searchFilter', q.text)
    if (q.gameVersion) params.set('gameVersion', q.gameVersion)
    const types = q.kind === 'mod' ? loaderTypes(q.loaders) : []
    if (types.length === 1) params.set('modLoaderType', String(types[0]))
    else if (types.length > 1) params.set('modLoaderTypes', JSON.stringify(types))
    if (q.category) {
      const category = (await this.rawCategories(q.kind)).find((c) => c.slug === q.category)
      // An unknown category (e.g. a Modrinth one left in the URL) matches nothing, not everything.
      if (!category) return { hits: [], total: 0 }
      params.set('categoryId', String(category.id))
    }
    const res = await this.request(
      `/mods/search?${params}`,
      CfSearchResponse,
      {},
      {
        ttlMs: TTL.search,
      },
    )
    return {
      hits: res.data.map(toHit),
      total: Math.min(res.pagination.totalCount, MAX_INDEX),
    }
  }

  /** Name search for "possible match" suggestions. */
  async search(q: {
    text: string
    kind: ContentKind
    loader?: Loader | null
    limit: number
  }): Promise<ProjectInfo[]> {
    const params = new URLSearchParams({
      gameId: String(MINECRAFT),
      classId: String(CLASS_ID[q.kind]),
      searchFilter: q.text,
      sortField: String(SORT_FIELD.relevance),
      sortOrder: 'desc',
      pageSize: String(Math.min(q.limit, PAGE_SIZE)),
    })
    const res = await this.request(
      `/mods/search?${params}`,
      CfSearchResponse,
      {},
      {
        ttlMs: TTL.search,
      },
    )
    return res.data.map(toProject)
  }

  /** Browse categories for a content kind, as `{ name: slug, label }`. */
  async categories(kind: ContentKind): Promise<Category[]> {
    return (await this.rawCategories(kind))
      .map((c) => ({ name: c.slug, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  private async rawCategories(kind: ContentKind): Promise<CfCategory[]> {
    const params = new URLSearchParams({
      gameId: String(MINECRAFT),
      classId: String(CLASS_ID[kind]),
    })
    const res = await this.request(
      `/categories?${params}`,
      CfCategoriesResponse,
      {},
      {
        ttlMs: TTL.tags,
      },
    )
    // Slugs double as URL/query values, so only plain ones.
    return res.data.filter((c) => !c.isClass && /^[a-z0-9-]{1,64}$/.test(c.slug))
  }

  private async getMods(ids: readonly string[]): Promise<CfMod[]> {
    const out: CfMod[] = []
    for (const batch of chunks([...new Set(ids)].filter(isNumericId), ID_BATCH)) {
      const res = await this.request('/mods', CfModsResponse, {
        method: 'POST',
        body: JSON.stringify({ modIds: batch.map(Number) }),
      })
      out.push(...res.data)
    }
    return out
  }

  /** A mod by numeric id, or by slug (which CurseForge only keeps unique within a class). */
  private async fetchMod(idOrSlug: string, kind: ContentKind): Promise<CfMod | null> {
    if (isNumericId(idOrSlug)) {
      const res = await this.request(
        `/mods/${idOrSlug}`,
        CfModResponse.nullable(),
        {},
        {
          ttlMs: TTL.project,
          notFound: null,
        },
      )
      return res?.data ?? null
    }
    const params = new URLSearchParams({
      gameId: String(MINECRAFT),
      classId: String(CLASS_ID[kind]),
      slug: idOrSlug,
    })
    const res = await this.request(
      `/mods/search?${params}`,
      CfSearchResponse,
      {},
      {
        ttlMs: TTL.project,
      },
    )
    return res.data.find((m) => m.slug === idOrSlug) ?? null
  }

  private request<S extends z.ZodType>(
    pathAndQuery: string,
    schema: S,
    init: RequestInit = {},
    options: { notFound?: z.output<S>; ttlMs?: number } = {},
  ): Promise<z.output<S>> {
    const { ttlMs } = options
    if (ttlMs === undefined || (init.method ?? 'GET') !== 'GET') {
      return this.send(pathAndQuery, schema, init, options)
    }
    return this.cache.get(pathAndQuery, ttlMs, () => this.send(pathAndQuery, schema, init, options))
  }

  private async send<S extends z.ZodType>(
    pathAndQuery: string,
    schema: S,
    init: RequestInit,
    options: { notFound?: z.output<S> },
  ): Promise<z.output<S>> {
    const key = this.getKey()
    if (!key) {
      throw new AppError('PROVIDER_DISABLED', 'CurseForge needs an API key. Add one in Settings.')
    }
    const route = `${init.method ?? 'GET'} ${pathAndQuery.split('?')[0]}`
    const res = await this.fetch(`${CURSEFORGE_API}${pathAndQuery}`, {
      ...init,
      headers: { 'x-api-key': key, Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((err: unknown) => {
      throw new AppError('PROVIDER_ERROR', `Can't reach CurseForge: ${String(err)}`)
    })

    if (res.status === 404 && options.notFound !== undefined) return options.notFound
    if (res.status === 401 || res.status === 403) {
      throw new AppError('PROVIDER_ERROR', 'CurseForge rejected the API key. Check it in Settings.')
    }
    if (!res.ok) {
      throw new AppError(
        res.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
        res.status === 429
          ? 'CurseForge rate limit reached. Try again in a minute.'
          : `CurseForge returned HTTP ${res.status} for ${route}`,
      )
    }
    const parsed = z.safeParse(schema, await res.json().catch(() => undefined))
    if (!parsed.success) {
      throw new AppError('PROVIDER_ERROR', 'Unexpected response from CurseForge', {
        path: pathAndQuery.split('?')[0],
        issues: z.flattenError(parsed.error),
      })
    }
    return parsed.data
  }
}
