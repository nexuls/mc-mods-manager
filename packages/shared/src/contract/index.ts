import * as health from './health'
import * as instance from './instance'
import * as meta from './meta'
import * as mods from './mods'
import * as projects from './projects'

export * from './define'
export * from './errors'
export { InstanceResponse } from './instance'
export { ModsResponse, UpdateModBody } from './mods'
export {
  ProjectId,
  SEARCH_PAGE_SIZE,
  SearchQuery,
  SearchResponse,
  VersionsResponse,
} from './projects'
export * from './query'
export * from './session'

/** The whole `/api` contract. Backend routes and frontend calls both go through it. */
export const api = { health, instance, meta, mods, projects }
