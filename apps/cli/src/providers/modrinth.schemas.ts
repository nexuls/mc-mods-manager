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

export const MrVersion = z.looseObject({
  id: z.string(),
  project_id: z.string(),
  version_number: z.string(),
  loaders: z.array(z.string()),
  game_versions: z.array(z.string()),
  environment: Environment.optional(),
  files: z.array(
    z.looseObject({
      filename: z.string(),
      primary: z.boolean(),
      hashes: z.looseObject({ sha1: z.string().optional(), sha512: z.string().optional() }),
    }),
  ),
})
export type MrVersion = z.infer<typeof MrVersion>

/** `POST /version_files`: hash → version. Hashes Modrinth doesn't know are left out. */
export const MrHashVersionMap = z.record(z.string(), MrVersion)

export const MrProject = z.looseObject({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  icon_url: z.string().nullable().optional(),
  project_type: z.string(),
  client_side: SideSupport.catch('unknown').optional(),
  server_side: SideSupport.catch('unknown').optional(),
  environment: z.array(Environment).optional(),
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
})

export const MrSearchResult = z.looseObject({ hits: z.array(MrSearchHit) })
