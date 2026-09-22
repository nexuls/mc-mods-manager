import type {
  Category,
  ContentKind,
  Loader,
  Project,
  ProjectHit,
  ProjectLink,
  ProjectVersion,
  SearchSort,
  Side,
} from '@mc-mod/shared'
import { z } from 'zod'
import { AppError } from '../errors'
import { TtlCache } from '../lib/ttl-cache'
import { VERSION } from '../version'
import {
  type Environment,
  MrCategoryTags,
  MrGameVersionTags,
  MrHashVersionMap,
  type MrProject,
  MrProject as MrProjectSchema,
  MrProjects,
  type MrSearchHit,
  MrSearchResult,
  type MrVersion,
  MrVersions,
} from './modrinth.schemas'
import type { Fetch, HashMatch, ProjectInfo } from './types'

export const MODRINTH_API = 'https://api.modrinth.com/v2'

/** Modrinth asks every client to identify itself; generic user agents may be blocked. */
export const USER_AGENT = `mc-mod/${VERSION} (mc-mods-manager; local Minecraft mod manager)`

const TIMEOUT_MS = 15_000
/** Hashes per `POST /version_files` request. */
const HASH_BATCH = 500
/** Ids per `GET /projects` request (they go in the URL). */
const PROJECT_BATCH = 100
/** Wait for a rate-limit reset once if it's this close; otherwise report the 429. */
const MAX_RETRY_WAIT_S = 5

/** How long GET responses are reused (external-apis.md, Caching). */
const TTL = { search: 2 * 60_000, project: 10 * 60_000, versions: 5 * 60_000, tags: 24 * 3600_000 }

/** Modrinth's environment → our side. "Optional" on the other side still means it runs there. */
const ENVIRONMENT_SIDE: Record<Environment, Side> = {
  client_only: 'client',
  singleplayer_only: 'client',
  client_only_server_optional: 'both',
  server_only: 'server',
  dedicated_server_only: 'server',
  server_only_client_optional: 'both',
  client_and_server: 'both',
  client_or_server: 'both',
  client_or_server_prefers_both: 'both',
  unknown: 'unknown',
}

export function environmentSide(env: Environment | undefined): Side | undefined {
  const side = env ? ENVIRONMENT_SIDE[env] : undefined
  return side === 'unknown' ? undefined : side
}

/** Project side: the newer `environment` list if it agrees on one side, else `client_side`/`server_side`. */
export function projectSide(
  p: Pick<MrProject, 'environment' | 'client_side' | 'server_side'>,
): Side {
  const sides = new Set((p.environment ?? []).map((e) => ENVIRONMENT_SIDE[e]))
  sides.delete('unknown')
  const [only] = sides
  if (sides.size === 1 && only) return only
  if (sides.size > 1) return 'both'
  const client = p.client_side ?? 'unknown'
  const server = p.server_side ?? 'unknown'
  if (client === 'unknown' || server === 'unknown') return 'unknown'
  if (client === 'unsupported' && server !== 'unsupported') return 'server'
  if (server === 'unsupported' && client !== 'unsupported') return 'client'
  return 'both'
}

function toProject(p: MrProject): ProjectInfo {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description ?? '',
    iconUrl: p.icon_url ?? undefined,
    side: projectSide(p),
  }
}

const nonEmpty = (s: string | null | undefined) => (s ? s : undefined)

function projectLinks(p: MrProject): ProjectLink[] {
  const links: ProjectLink[] = []
  const add = (label: string, url: string | null | undefined) => {
    if (url) links.push({ label, url })
  }
  add('Source', p.source_url)
  add('Issues', p.issues_url)
  add('Wiki', p.wiki_url)
  add('Discord', p.discord_url)
  for (const d of p.donation_urls ?? []) add(d.platform, d.url)
  return links
}

/** SPDX id or name; `LicenseRef-…` ids without a name are custom licenses. */
function licenseLabel(l: MrProject['license']): string | undefined {
  const name = nonEmpty(l?.name)
  if (name || !l) return name
  return l.id.startsWith('LicenseRef-') ? 'Custom license' : nonEmpty(l.id)
}

function toProjectPage(p: MrProject): Project {
  return {
    provider: 'modrinth',
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description ?? '',
    body: p.body ?? '',
    iconUrl: p.icon_url ?? undefined,
    downloads: p.downloads ?? 0,
    follows: p.followers,
    updatedAt: p.updated,
    categories: p.categories ?? [],
    loaders: p.loaders ?? [],
    gameVersions: p.game_versions ?? [],
    side: projectSide(p),
    license: licenseLabel(p.license),
    pageUrl: `https://modrinth.com/project/${p.slug}`,
    links: projectLinks(p),
    gallery: [...(p.gallery ?? [])]
      .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
      .map((g) => ({
        url: g.url,
        rawUrl: g.raw_url,
        title: nonEmpty(g.title),
        description: nonEmpty(g.description),
      })),
  }
}

function toHit(h: MrSearchHit): ProjectHit {
  return {
    provider: 'modrinth',
    id: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description ?? '',
    iconUrl: h.icon_url ?? undefined,
    author: h.author,
    downloads: h.downloads ?? 0,
    follows: h.follows,
    updatedAt: h.date_modified,
    categories: h.display_categories ?? [],
    side: projectSide(h),
  }
}

export function toVersion(v: MrVersion): ProjectVersion {
  const jars = v.files.filter((f) => f.filename.toLowerCase().endsWith('.jar'))
  const file = jars.find((f) => f.primary) ?? jars[0]
  return {
    provider: 'modrinth',
    id: v.id,
    projectId: v.project_id,
    name: v.name,
    versionNumber: v.version_number,
    type: v.version_type,
    publishedAt: v.date_published,
    downloads: v.downloads,
    loaders: v.loaders,
    gameVersions: v.game_versions,
    side: environmentSide(v.environment),
    file: file
      ? {
          name: file.filename,
          url: file.url,
          size: file.size,
          sha1: file.hashes.sha1,
          sha512: file.hashes.sha512,
        }
      : null,
    dependencies: v.dependencies.map((d) => ({
      projectId: d.project_id ?? undefined,
      versionId: d.version_id ?? undefined,
      type: d.dependency_type,
    })),
  }
}

/** What Browse asks for. `loaders` are OR'ed; an empty list or no game version means no filter. */
export interface BrowseQuery {
  text: string
  kind: ContentKind
  loaders: readonly Loader[]
  gameVersion?: string | null
  category?: string
  sort: SearchSort
  offset: number
  limit: number
}

function toMatch(v: MrVersion): HashMatch {
  return {
    projectId: v.project_id,
    versionId: v.id,
    versionNumber: v.version_number,
    loaders: v.loaders,
    gameVersions: v.game_versions,
    side: environmentSide(v.environment),
  }
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export class ModrinthProvider {
  private readonly cache = new TtlCache()

  // globalThis: a bare `fetch` in the default would refer to this parameter itself.
  constructor(private readonly fetch: Fetch = (url, init) => globalThis.fetch(url, init)) {}

  /** Exact-file lookup by sha1. Unknown hashes are missing from the map. */
  async identify(sha1s: readonly string[]): Promise<Map<string, HashMatch>> {
    const out = new Map<string, HashMatch>()
    for (const hashes of chunks([...new Set(sha1s)], HASH_BATCH)) {
      const map = await this.request('/version_files', MrHashVersionMap, {
        method: 'POST',
        body: JSON.stringify({ hashes, algorithm: 'sha1' }),
      })
      for (const [hash, v] of Object.entries(map)) out.set(hash.toLowerCase(), toMatch(v))
    }
    return out
  }

  async getProjects(ids: readonly string[]): Promise<Map<string, ProjectInfo>> {
    const out = new Map<string, ProjectInfo>()
    for (const batch of chunks([...new Set(ids)], PROJECT_BATCH)) {
      const list = await this.request(
        `/projects?ids=${encodeURIComponent(JSON.stringify(batch))}`,
        MrProjects,
      )
      for (const p of list) out.set(p.id, toProject(p))
    }
    return out
  }

  /** A project by id or slug, or null if Modrinth doesn't have it. */
  async getProject(idOrSlug: string): Promise<ProjectInfo | null> {
    const p = await this.fetchProject(idOrSlug)
    return p ? toProject(p) : null
  }

  /** The full project for its page (body, links, gallery), or null if Modrinth doesn't have it. */
  async getProjectPage(idOrSlug: string): Promise<Project | null> {
    const p = await this.fetchProject(idOrSlug)
    return p ? toProjectPage(p) : null
  }

  private fetchProject(idOrSlug: string): Promise<MrProject | null> {
    return this.request(
      `/project/${encodeURIComponent(idOrSlug)}`,
      MrProjectSchema.nullable(),
      {},
      { notFound: null, ttlMs: TTL.project },
    )
  }

  /** A project's versions, newest first. Filters are sent to Modrinth; empty ones are left out. */
  async getVersions(
    idOrSlug: string,
    filter: { loaders?: readonly string[]; gameVersions?: readonly string[] } = {},
  ): Promise<ProjectVersion[] | null> {
    const params = new URLSearchParams({ include_changelog: 'false' })
    if (filter.loaders?.length) params.set('loaders', JSON.stringify(filter.loaders))
    if (filter.gameVersions?.length) {
      params.set('game_versions', JSON.stringify(filter.gameVersions))
    }
    const list = await this.request(
      `/project/${encodeURIComponent(idOrSlug)}/version?${params}`,
      MrVersions.nullable(),
      {},
      { notFound: null, ttlMs: TTL.versions },
    )
    return list ? list.map(toVersion) : null
  }

  /** Versions by id; ids Modrinth doesn't know are missing from the map. */
  async getVersionsByIds(ids: readonly string[]): Promise<Map<string, ProjectVersion>> {
    const out = new Map<string, ProjectVersion>()
    for (const batch of chunks([...new Set(ids)], PROJECT_BATCH)) {
      const list = await this.request(
        `/versions?ids=${encodeURIComponent(JSON.stringify(batch))}&include_changelog=false`,
        MrVersions,
      )
      for (const v of list) out.set(v.id, toVersion(v))
    }
    return out
  }

  /** Project search for Browse. */
  async browse(q: BrowseQuery): Promise<{ hits: ProjectHit[]; total: number }> {
    const facets = [[`project_type:${q.kind}`]]
    const loaders = q.loaders.filter((l) => l !== 'vanilla')
    if (loaders.length > 0) facets.push(loaders.map((l) => `categories:${l}`))
    if (q.gameVersion) facets.push([`versions:${q.gameVersion}`])
    if (q.category) facets.push([`categories:${q.category}`])
    const params = new URLSearchParams({
      query: q.text,
      facets: JSON.stringify(facets),
      index: q.sort,
      offset: String(q.offset),
      limit: String(q.limit),
    })
    const res = await this.request(`/search?${params}`, MrSearchResult, {}, { ttlMs: TTL.search })
    return { hits: res.hits.map(toHit), total: res.total_hits }
  }

  /** Name search for "possible match" suggestions. */
  async search(q: {
    text: string
    kind: ContentKind
    loader?: Loader | null
    limit: number
  }): Promise<ProjectInfo[]> {
    const { hits } = await this.browse({
      text: q.text,
      kind: q.kind,
      loaders: q.loader ? [q.loader] : [],
      sort: 'relevance',
      offset: 0,
      limit: q.limit,
    })
    return hits.map((h) => ({
      id: h.id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      iconUrl: h.iconUrl,
      author: h.author,
      downloads: h.downloads,
      side: h.side,
    }))
  }

  /** Minecraft versions, newest first. Snapshots only when asked for. */
  async gameVersions(includeSnapshots: boolean): Promise<string[]> {
    const tags = await this.request('/tag/game_version', MrGameVersionTags, {}, { ttlMs: TTL.tags })
    return tags
      .filter((t) => includeSnapshots || t.version_type === 'release')
      .map((t) => t.version)
  }

  /** Browse categories for a content kind (loaders are left out; they're a separate filter). */
  async categories(kind: ContentKind): Promise<Category[]> {
    const tags = await this.request('/tag/category', MrCategoryTags, {}, { ttlMs: TTL.tags })
    return tags
      .filter((t) => t.project_type === kind && t.header === 'categories')
      .map((t) => ({ name: t.name, label: categoryLabel(t.name) }))
      .sort((a, b) => a.label.localeCompare(b.label))
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
    const url = `${MODRINTH_API}${pathAndQuery}`
    const headers = { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' }
    const send = () =>
      this.fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(
        (err: unknown) => {
          throw new AppError('PROVIDER_ERROR', `Can't reach Modrinth: ${String(err)}`)
        },
      )

    let res = await send()
    if (res.status === 429) {
      const wait = Number(res.headers.get('X-Ratelimit-Reset') ?? Number.NaN)
      if (!(wait <= MAX_RETRY_WAIT_S)) {
        throw new AppError('RATE_LIMITED', 'Modrinth rate limit reached. Try again in a minute.')
      }
      await Bun.sleep(Math.max(wait, 0) * 1000 + 100)
      res = await send()
    }
    if (res.status === 404 && options.notFound !== undefined) return options.notFound
    if (!res.ok) {
      throw new AppError(
        res.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
        `Modrinth returned HTTP ${res.status} for ${init.method ?? 'GET'} ${pathAndQuery.split('?')[0]}`,
      )
    }
    const parsed = z.safeParse(schema, await res.json().catch(() => undefined))
    if (!parsed.success) {
      throw new AppError('PROVIDER_ERROR', 'Unexpected response from Modrinth', {
        path: pathAndQuery.split('?')[0],
        issues: z.flattenError(parsed.error),
      })
    }
    return parsed.data
  }
}

/** `worldgen` → `Worldgen`, `game-mechanics` → `Game mechanics`. */
function categoryLabel(name: string): string {
  const words = name.replaceAll('-', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
