import * as serverExport from './export'
import * as health from './health'
import * as install from './install'
import * as instance from './instance'
import * as jobs from './jobs'
import * as meta from './meta'
import * as mods from './mods'
import * as projects from './projects'
import * as settings from './settings'
import * as trash from './trash'

export * from './define'
export * from './errors'
export {
  ExportBody,
  ExportMode,
  ExportPreview,
  ExportResult,
  RevealBody,
} from './export'
export {
  InstallBody,
  PlanBody,
  PlanItem,
  PlanResponse,
  PlanRole,
  PlanStatus,
} from './install'
export { InstanceResponse } from './instance'
export { JobEvent, JobId } from './jobs'
export {
  ModsResponse,
  UpdateAllBody,
  UpdateJobItem,
  UpdateJobResponse,
  UpdateModBody,
  UpdateOneBody,
} from './mods'
export {
  ProjectId,
  SEARCH_PAGE_SIZE,
  SearchQuery,
  SearchResponse,
  VersionsResponse,
} from './projects'
export * from './query'
export * from './session'
export { KeySource, Settings, SettingsBody, TestKeyResponse } from './settings'
export { TrashId, TrashItem, TrashResponse } from './trash'

/** The whole `/api` contract. Backend routes and frontend calls both go through it. */
export const api = {
  export: serverExport,
  health,
  install,
  instance,
  jobs,
  meta,
  mods,
  projects,
  settings,
  trash,
}
