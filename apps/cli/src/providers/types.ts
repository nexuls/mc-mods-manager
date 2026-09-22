import type { Side } from '@mc-mod/shared'

// Normalized provider results. Nothing outside providers/ sees platform response shapes.

/** Plain `fetch` signature, so tests can pass a fake. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** The platform version/file an exact hash belongs to. */
export interface HashMatch {
  projectId: string
  versionId: string
  versionNumber: string
  loaders: string[]
  gameVersions: string[]
  /** Where this version says it runs; undefined when the platform doesn't say. */
  side?: Side
}

export interface ProjectInfo {
  id: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  author?: string
  downloads?: number
  /** Where the project says it runs. */
  side: Side
}
