import { z } from 'zod'
import { InstalledMod, ModFileName, ModSuggestion, Provider } from '../domain/mod'
import { Side } from '../domain/side'
import { defineEndpoint } from './define'

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

/** Moves the jar to `.mc-mod/trash/`. */
export const remove = defineEndpoint({
  method: 'DELETE',
  path: '/api/mods/:fileName',
  params: FileParams,
  response: z.strictObject({ fileName: ModFileName, trashPath: z.string() }),
})

/** Low-confidence "possible match" candidates. Never applied without the user. */
export const suggestions = defineEndpoint({
  method: 'GET',
  path: '/api/mods/:fileName/suggestions',
  params: FileParams,
  response: z.strictObject({ suggestions: z.array(ModSuggestion) }),
})
