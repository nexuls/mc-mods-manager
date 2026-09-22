import { z } from 'zod'

// Modrinth v2 response shapes (https://docs.modrinth.com/api/). Loose, and only the fields we read.

/** Legacy per-project side fields. */
const SideSupport = z.enum(['required', 'optional', 'unsupported', 'unknown'])

/** Newer per-version (and per-project, as a list) environment. Unknown values degrade to `unknown`. */
export const Environment = z
  .enum([
    'client_and_server',
    'client_only',
    'client_only_server_optional',
    'singleplayer_only',
    'server_only',
    'server_only_client_optional',
    'dedicated_server_only',
    'client_or_server',
    'client_or_server_prefers_both',
    'unknown',
  ])
  .catch('unknown')
export type Environment = z.infer<typeof Environment>

export const MrDependency = z.looseObject({
  project_id: z.string().nullable().optional(),
  version_id: z.string().nullable().optional(),
  dependency_type: z.enum(['required', 'optional', 'incompatible', 'embedded']),
})

export const MrVersion = z.looseObject({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  /** Anything new is treated as the least stable channel. */
  version_type: z.enum(['release', 'beta', 'alpha']).catch('alpha'),
  date_published: z.string(),
  downloads: z.number(),
  loaders: z.array(z.string()),
  game_versions: z.array(z.string()),
  environment: Environment.optional(),
  files: z.array(
    z.looseObject({
      filename: z.string(),
      url: z.string(),
      size: z.number(),
      primary: z.boolean(),
      hashes: z.looseObject({ sha1: z.string().optional(), sha512: z.string().optional() }),
    }),
  ),
  dependencies: z.array(MrDependency).catch([]),
})
export type MrVersion = z.infer<typeof MrVersion>

/** `POST /version_files`: hash → version. Hashes Modrinth doesn't know are left out. */
export const MrHashVersionMap = z.record(z.string(), MrVersion)
export const MrVersions = z.array(MrVersion)

export const MrProject = z.looseObject({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  body: z.string().optional(),
  icon_url: z.string().nullable().optional(),
  project_type: z.string(),
  client_side: SideSupport.catch('unknown').optional(),
  server_side: SideSupport.catch('unknown').optional(),
  environment: z.array(Environment).optional(),
  downloads: z.number().optional(),
  followers: z.number().optional(),
  updated: z.string().optional(),
  categories: z.array(z.string()).optional(),
  loaders: z.array(z.string()).optional(),
  game_versions: z.array(z.string()).optional(),
  license: z.looseObject({ id: z.string(), name: z.string().optional() }).nullable().optional(),
  issues_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  wiki_url: z.string().nullable().optional(),
  discord_url: z.string().nullable().optional(),
  donation_urls: z
    .array(z.looseObject({ platform: z.string(), url: z.string() }))
    .nullable()
    .optional(),
  gallery: z
    .array(
      z.looseObject({
        url: z.string(),
        raw_url: z.string().optional(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        ordering: z.number().optional(),
      }),
    )
    .optional(),
})
export type MrProject = z.infer<typeof MrProject>

export const MrProjects = z.array(MrProject)

export const MrSearchHit = z.looseObject({
  project_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  icon_url: z.string().nullable().optional(),
  author: z.string().optional(),
  downloads: z.number().optional(),
  follows: z.number().optional(),
  date_modified: z.string().optional(),
  /** Loaders and categories; `display_categories` leaves out the hidden ones. */
  display_categories: z.array(z.string()).optional(),
  client_side: SideSupport.catch('unknown').optional(),
  server_side: SideSupport.catch('unknown').optional(),
  environment: z.array(Environment).optional(),
})
export type MrSearchHit = z.infer<typeof MrSearchHit>

export const MrSearchResult = z.looseObject({
  hits: z.array(MrSearchHit),
  offset: z.number(),
  limit: z.number(),
  total_hits: z.number(),
})

export const MrGameVersionTags = z.array(
  z.looseObject({
    version: z.string(),
    version_type: z.string(),
    date: z.string(),
    major: z.boolean().optional(),
  }),
)

export const MrCategoryTags = z.array(
  z.looseObject({ name: z.string(), project_type: z.string(), header: z.string() }),
)
