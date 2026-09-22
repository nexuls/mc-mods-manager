import { z } from 'zod'

// CurseForge v1 response shapes (https://docs.curseforge.com/rest-api/). Loose, and only the fields
// we read. Every response wraps its payload in `data`.

const Id = z.number().int()
const Url = z.string().nullable().optional()

/** `hashes[].algo`: 1 = sha1, 2 = md5. */
export const HASH_SHA1 = 1

/** `releaseType`: 1 = release, 2 = beta, 3 = alpha. */
export const ReleaseType = z.number().int()

/** `dependencies[].relationType`: 1 embedded, 2 optional, 3 required, 4 tool, 5 incompatible, 6 include. */
export const RelationType = z.number().int()

export const CfFile = z.looseObject({
  id: Id,
  modId: Id,
  displayName: z.string(),
  fileName: z.string(),
  releaseType: ReleaseType,
  fileDate: z.string(),
  fileLength: z.number(),
  downloadCount: z.number().catch(0),
  /** null when the author disabled third-party distribution. */
  downloadUrl: z.string().nullable().optional(),
  /** Mixes game versions, loader names ("NeoForge") and sometimes "Client"/"Server". */
  gameVersions: z.array(z.string()).catch([]),
  dependencies: z.array(z.looseObject({ modId: Id, relationType: RelationType })).catch([]),
  hashes: z.array(z.looseObject({ value: z.string(), algo: z.number() })).catch([]),
  fileFingerprint: z.number(),
  isAvailable: z.boolean().optional(),
})
export type CfFile = z.infer<typeof CfFile>

const CfAsset = z.looseObject({
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: Url,
  url: Url,
})

export const CfCategory = z.looseObject({
  id: Id,
  name: z.string(),
  slug: z.string(),
  classId: Id.nullable().optional(),
  isClass: z.boolean().nullable().optional(),
  parentCategoryId: Id.nullable().optional(),
})
export type CfCategory = z.infer<typeof CfCategory>

export const CfMod = z.looseObject({
  id: Id,
  slug: z.string(),
  name: z.string(),
  summary: z.string().catch(''),
  classId: Id.nullable().optional(),
  links: z
    .looseObject({ websiteUrl: Url, wikiUrl: Url, issuesUrl: Url, sourceUrl: Url })
    .nullable()
    .optional(),
  logo: CfAsset.nullable().optional(),
  screenshots: z.array(CfAsset).catch([]),
  authors: z.array(z.looseObject({ name: z.string() })).catch([]),
  downloadCount: z.number().catch(0),
  thumbsUpCount: z.number().optional(),
  dateModified: z.string().optional(),
  categories: z.array(CfCategory).catch([]),
  latestFilesIndexes: z
    .array(z.looseObject({ gameVersion: z.string(), modLoader: z.number().nullable().optional() }))
    .catch([]),
  allowModDistribution: z.boolean().nullable().optional(),
})
export type CfMod = z.infer<typeof CfMod>

const Pagination = z.looseObject({
  index: z.number(),
  pageSize: z.number(),
  resultCount: z.number(),
  totalCount: z.number(),
})

export const CfModResponse = z.looseObject({ data: CfMod })
export const CfModsResponse = z.looseObject({ data: z.array(CfMod) })
export const CfSearchResponse = z.looseObject({ data: z.array(CfMod), pagination: Pagination })
export const CfFilesResponse = z.looseObject({
  data: z.array(CfFile),
  pagination: Pagination.optional(),
})
export const CfDescriptionResponse = z.looseObject({ data: z.string() })
export const CfCategoriesResponse = z.looseObject({ data: z.array(CfCategory) })

/** `POST /fingerprints/{gameId}`. */
export const CfFingerprintResponse = z.looseObject({
  data: z.looseObject({
    exactMatches: z.array(z.looseObject({ id: Id, file: CfFile })).catch([]),
  }),
})
