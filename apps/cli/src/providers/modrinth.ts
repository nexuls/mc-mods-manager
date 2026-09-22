import type { ContentKind, Loader, Side } from '@mc-mod/shared'
import { z } from 'zod'
import { AppError } from '../errors'
import { VERSION } from '../version'
import {
  type Environment,
  MrHashVersionMap,
  type MrProject,
  MrProject as MrProjectSchema,
  MrProjects,
  MrSearchResult,
  type MrVersion,
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
export function projectSide(p: MrProject): Side {
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
    const p = await this.request(
      `/project/${encodeURIComponent(idOrSlug)}`,
      MrProjectSchema.nullable(),
      {},
      { notFound: null },
    )
    return p ? toProject(p) : null
  }

  async search(q: {
    text: string
    kind: ContentKind
    loader?: Loader | null
    limit: number
  }): Promise<ProjectInfo[]> {
    const facets = [[`project_type:${q.kind}`]]
    if (q.loader && q.loader !== 'vanilla') facets.push([`categories:${q.loader}`])
    const params = new URLSearchParams({
      query: q.text,
      facets: JSON.stringify(facets),
      limit: String(q.limit),
    })
    const { hits } = await this.request(`/search?${params}`, MrSearchResult)
    return hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description ?? '',
      iconUrl: h.icon_url ?? undefined,
      author: h.author,
      downloads: h.downloads,
      side: 'unknown',
    }))
  }

  private async request<S extends z.ZodType>(
    pathAndQuery: string,
    schema: S,
    init: RequestInit = {},
    options: { notFound?: z.output<S> } = {},
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
