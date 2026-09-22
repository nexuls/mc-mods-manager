import { z } from 'zod'
import { GameVersion } from '../domain/instance'
import { ContentKind, Loader } from '../domain/loader'
import { Provider } from '../domain/mod'
import { Project, ProjectHit, RankedVersion, SearchSort } from '../domain/project'
import { defineEndpoint } from './define'
import { QueryBool, QueryInt } from './query'

export const SEARCH_PAGE_SIZE = 20

/** A Modrinth id or slug, or a CurseForge id. */
export const ProjectId = z.string().regex(/^[\w.-]{1,64}$/, 'Not a project id or slug')

export const SearchQuery = z.strictObject({
  provider: Provider.default('modrinth'),
  q: z.string().trim().max(200).default(''),
  sort: SearchSort.default('relevance'),
  page: QueryInt.pipe(z.number().max(500)).default(0),
  /** Defaults to what the instance holds (mods or plugins). */
  kind: ContentKind.optional(),
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  /** Override the instance's game version / loader filter. */
  gameVersion: GameVersion.optional(),
  loader: Loader.optional(),
  /** "Show incompatible": leave out the game version and loader filters. */
  all: QueryBool.default(false),
})
export type SearchQuery = z.input<typeof SearchQuery>

export const SearchResponse = z.strictObject({
  hits: z.array(ProjectHit),
  total: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  /** The filters that were applied, so the UI can say what it searched for. */
  filters: z.strictObject({ gameVersion: z.string().nullable(), loaders: z.array(Loader) }),
})
export type SearchResponse = z.infer<typeof SearchResponse>

/** Searches a platform, filtered to the instance's game version and loader by default. */
export const search = defineEndpoint({
  method: 'GET',
  path: '/api/search',
  query: SearchQuery,
  response: SearchResponse,
})

const ProjectParams = z.strictObject({ provider: Provider, id: ProjectId })

/** Project page: description body, links, gallery. */
export const project = defineEndpoint({
  method: 'GET',
  path: '/api/projects/:provider/:id',
  params: ProjectParams,
  response: Project,
})

export const VersionsResponse = z.strictObject({ versions: z.array(RankedVersion) })
export type VersionsResponse = z.infer<typeof VersionsResponse>

/** A project's versions, newest first, with the best pick for the instance marked `recommended`. */
export const versions = defineEndpoint({
  method: 'GET',
  path: '/api/projects/:provider/:id/versions',
  params: ProjectParams,
  /** `all`: every version, not only the ones for this loader and game version. */
  query: z.strictObject({ all: QueryBool.default(false) }),
  response: VersionsResponse,
})
