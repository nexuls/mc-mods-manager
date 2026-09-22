import { z } from 'zod'
import { InstalledMod, ModFileName, ModSuggestion, Provider } from '../domain/mod'
import { Side } from '../domain/side'
import { defineEndpoint } from './define'
import { JobId } from './jobs'
import { ProjectId } from './projects'
import { TrashId } from './trash'

export const ModsResponse = z.strictObject({
  mods: z.array(InstalledMod),
  /** Things the user should know, e.g. Modrinth couldn't be reached and saved results are shown. */
  warnings: z.array(z.string()),
})
export type ModsResponse = z.infer<typeof ModsResponse>

const FileParams = z.strictObject({ fileName: ModFileName })

/** Installed content. Jars not looked up before are identified on the way (one bulk request). */
export const list = defineEndpoint({
  method: 'GET',
  path: '/api/mods',
  response: ModsResponse,
})

/** Re-scans the folder and looks every jar up again. */
export const refresh = defineEndpoint({
  method: 'POST',
  path: '/api/mods/refresh',
  response: ModsResponse,
})

export const UpdateModBody = z.strictObject({
  /** Renames to/from `.jar.disabled`. */
  enabled: z.boolean().optional(),
  /** null clears the override. */
  sideOverride: Side.nullable().optional(),
  /** Pins the provider used for updates and "open page"; null goes back to the preferred one. */
  primarySource: Provider.nullable().optional(),
  /** Links the jar to a project by hand; null removes the manual link. */
  link: z
    .strictObject({ provider: Provider, projectId: z.string().trim().min(1) })
    .nullable()
    .optional(),
  /** "Treat as local": hide every source. */
  unlinked: z.boolean().optional(),
})
export type UpdateModBody = z.infer<typeof UpdateModBody>

/** Returns the mod after the change (its `fileName` changes when enabling/disabling). */
export const update = defineEndpoint({
  method: 'PATCH',
  path: '/api/mods/:fileName',
  params: FileParams,
  body: UpdateModBody,
  response: InstalledMod,
})

/** Moves the jar to `.mc-mod/trash/`; `trashId` restores it (`api.trash.restore`). */
export const remove = defineEndpoint({
  method: 'DELETE',
  path: '/api/mods/:fileName',
  params: FileParams,
  response: z.strictObject({ fileName: ModFileName, trashPath: z.string(), trashId: TrashId }),
})

/** Low-confidence "possible match" candidates. Never applied without the user. */
export const suggestions = defineEndpoint({
  method: 'GET',
  path: '/api/mods/:fileName/suggestions',
  params: FileParams,
  response: z.strictObject({ suggestions: z.array(ModSuggestion) }),
})

/**
 * Looks for a newer fitting version of every identified mod on its primary source (architecture §7.3).
 * The results are kept for this run, so later lists include `update` too.
 */
export const checkUpdates = defineEndpoint({
  method: 'POST',
  path: '/api/mods/check-updates',
  response: ModsResponse,
})

/** One jar an update job replaces. `item-*` job events use the index into `items`. */
export const UpdateJobItem = z.strictObject({
  fileName: ModFileName,
  title: z.string(),
  fromVersion: z.string().optional(),
  toVersion: z.string(),
})
export type UpdateJobItem = z.infer<typeof UpdateJobItem>

export const UpdateJobResponse = z.strictObject({
  jobId: JobId,
  items: z.array(UpdateJobItem),
})
export type UpdateJobResponse = z.infer<typeof UpdateJobResponse>

export const UpdateOneBody = z.strictObject({
  /**
   * A version of the primary source's project, newer or older ("Change version"). Left out: the update
   * found by the last check, or the best version for the instance.
   */
  versionId: ProjectId.optional(),
})
export type UpdateOneBody = z.infer<typeof UpdateOneBody>

/**
 * Replaces one jar with another version of it in a background job: download, verify, then the old
 * jar goes to `.mc-mod/trash/`. A disabled jar stays disabled.
 */
export const updateOne = defineEndpoint({
  method: 'POST',
  path: '/api/mods/:fileName/update',
  params: FileParams,
  body: UpdateOneBody,
  response: UpdateJobResponse,
})

export const UpdateAllBody = z.strictObject({
  /** Only these jars; every jar with an update when left out. */
  fileNames: z.array(ModFileName).max(500).optional(),
})
export type UpdateAllBody = z.infer<typeof UpdateAllBody>

/**
 * Updates every jar the last check found an update for (or the given ones), except those that have to be
 * downloaded by hand. CONFLICT when there's nothing to update.
 */
export const updateAll = defineEndpoint({
  method: 'POST',
  path: '/api/mods/update-all',
  body: UpdateAllBody,
  response: UpdateJobResponse,
})
