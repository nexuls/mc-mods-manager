import { z } from 'zod'
import { Provider } from './mod'
import { Side } from './side'

// Normalized platform projects and versions, as the Browse and project views see them.

export const SearchSort = z.enum(['relevance', 'downloads', 'follows', 'newest', 'updated'])
export type SearchSort = z.infer<typeof SearchSort>

export const searchSortLabel: Record<SearchSort, string> = {
  relevance: 'Relevance',
  downloads: 'Downloads',
  follows: 'Follows',
  newest: 'Newest',
  updated: 'Recently updated',
}

/** One search result. */
export const ProjectHit = z.strictObject({
  provider: Provider,
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  iconUrl: z.string().optional(),
  author: z.string().optional(),
  downloads: z.number(),
  follows: z.number().optional(),
  /** ISO date of the last change. */
  updatedAt: z.string().optional(),
  categories: z.array(z.string()),
  side: Side,
})
export type ProjectHit = z.infer<typeof ProjectHit>

export const ProjectLink = z.strictObject({ label: z.string(), url: z.string() })
export type ProjectLink = z.infer<typeof ProjectLink>

export const GalleryImage = z.strictObject({
  url: z.string(),
  /** Full-size image, when the platform has one besides the thumbnail. */
  rawUrl: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
})
export type GalleryImage = z.infer<typeof GalleryImage>

/** A project with its description body, for the project page. */
export const Project = z.strictObject({
  provider: Provider,
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  /** Long description, Markdown with inline HTML. Render sanitized. */
  body: z.string(),
  iconUrl: z.string().optional(),
  downloads: z.number(),
  follows: z.number().optional(),
  updatedAt: z.string().optional(),
  categories: z.array(z.string()),
  loaders: z.array(z.string()),
  gameVersions: z.array(z.string()),
  side: Side,
  license: z.string().optional(),
  /** The project page on the platform. */
  pageUrl: z.string(),
  links: z.array(ProjectLink),
  gallery: z.array(GalleryImage),
})
export type Project = z.infer<typeof Project>

export const VersionType = z.enum(['release', 'beta', 'alpha'])
export type VersionType = z.infer<typeof VersionType>

export const DependencyType = z.enum(['required', 'optional', 'incompatible', 'embedded'])
export type DependencyType = z.infer<typeof DependencyType>

export const VersionDependency = z.strictObject({
  /** Missing when the platform only names a version or a file. */
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  type: DependencyType,
})
export type VersionDependency = z.infer<typeof VersionDependency>

/** The file a version installs. */
export const VersionFile = z.strictObject({
  name: z.string(),
  /**
   * null when the author only allows downloads from the platform's own site (CurseForge's
   * "third-party distribution" setting): the user has to download it from `ProjectVersion.pageUrl`.
   */
  url: z.string().nullable(),
  size: z.number().int().nonnegative(),
  sha1: z.string().optional(),
  sha512: z.string().optional(),
})
export type VersionFile = z.infer<typeof VersionFile>

/** One version (Modrinth) or file (CurseForge) of a project. */
export const ProjectVersion = z.strictObject({
  provider: Provider,
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  versionNumber: z.string(),
  type: VersionType,
  /** ISO date. */
  publishedAt: z.string(),
  downloads: z.number(),
  loaders: z.array(z.string()),
  gameVersions: z.array(z.string()),
  side: Side.optional(),
  /** The primary file; null when the version has no jar we can install. */
  file: VersionFile.nullable(),
  dependencies: z.array(VersionDependency),
  /** The version's page on the platform, for downloading by hand. */
  pageUrl: z.string().optional(),
})
export type ProjectVersion = z.infer<typeof ProjectVersion>

/** A version as the project page lists it: with how well it fits the instance. */
export const RankedVersion = ProjectVersion.extend({
  /** Runs on this instance's loader and game version. */
  compatible: z.boolean(),
  /** The best pick for this instance (architecture §7.3). */
  recommended: z.boolean(),
  /** Why it's a less direct fit, e.g. `Fabric build` on a Quilt instance. */
  note: z.string().optional(),
})
export type RankedVersion = z.infer<typeof RankedVersion>

/** A platform category for the Browse filter. `name` is its slug. */
export const Category = z.strictObject({ name: z.string(), label: z.string() })
export type Category = z.infer<typeof Category>
