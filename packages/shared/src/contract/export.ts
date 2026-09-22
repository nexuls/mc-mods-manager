import { z } from 'zod'
import { ExportDirName } from '../domain/config'
import { InstalledMod, ModFileName } from '../domain/mod'
import { defineEndpoint } from './define'

/** `copy`: jars into `<instance>/<dirName>/`. `zip`: one `<dirName>-<version>-<date>.zip` in the instance root. */
export const ExportMode = z.enum(['copy', 'zip'])
export type ExportMode = z.infer<typeof ExportMode>

const DirQuery = z.strictObject({
  /** The export folder in the instance root; the `exportDirName` setting when left out. */
  dirName: ExportDirName.optional(),
})

export const ExportPreview = z.strictObject({
  /** Absolute path of the export folder. */
  dir: z.string(),
  dirName: ExportDirName,
  /** File name a zip export gets today, created in the instance root. */
  zipName: z.string(),
  /** Enabled mods that run on the server: `server` and `both`. */
  include: z.array(InstalledMod),
  /** Enabled mods whose side nobody knows. Exported unless the user leaves them out. */
  unknown: z.array(InstalledMod),
  /** Client-only and disabled mods. Never exported. */
  exclude: z.array(InstalledMod),
  /** `.jar` files already in the export folder; a clean export removes them. */
  existingJars: z.number().int().nonnegative(),
})
export type ExportPreview = z.infer<typeof ExportPreview>

/** What an export would contain. BAD_REQUEST for plugin instances, whose content is server-only already. */
export const preview = defineEndpoint({
  method: 'GET',
  path: '/api/export/preview',
  query: DirQuery,
  response: ExportPreview,
})

export const ExportBody = z.strictObject({
  mode: ExportMode,
  dirName: ExportDirName.optional(),
  /** Copy mode: remove the `.jar` files of earlier exports from the folder first. */
  clean: z.boolean(),
  /** `include`/`unknown` jars to leave out this time. */
  exclude: z.array(ModFileName).max(2000).default([]),
})
export type ExportBody = z.infer<typeof ExportBody>

export const ExportResult = z.strictObject({
  mode: ExportMode,
  /** The folder (copy) or zip file (zip) written. */
  path: z.string(),
  /** Jars exported. */
  count: z.number().int().nonnegative(),
  /** Old jars removed from the folder (clean copy). */
  removed: z.number().int().nonnegative(),
})
export type ExportResult = z.infer<typeof ExportResult>

/** Copies or zips the server-side jars. The mods folder is only read. */
export const run = defineEndpoint({
  method: 'POST',
  path: '/api/export',
  body: ExportBody,
  response: ExportResult,
})

export const RevealBody = z.strictObject({
  /** `copy` opens the export folder, `zip` the instance root (where the zips are). */
  mode: ExportMode,
  dirName: ExportDirName.optional(),
})
export type RevealBody = z.infer<typeof RevealBody>

/** Opens the export's folder in the OS file manager. `opened` is false without a desktop (e.g. over SSH). */
export const reveal = defineEndpoint({
  method: 'POST',
  path: '/api/export/reveal',
  body: RevealBody,
  response: z.strictObject({ opened: z.boolean(), path: z.string() }),
})
