import { z } from 'zod'
import { GameVersion, InstanceKind, LoaderVersion } from './instance'
import { JavaInfo } from './java'
import { ContentKind, Loader } from './loader'
import { ModFileName, Provider, Sha1 } from './mod'
import { Side } from './side'

/** Marks a file as a mod list of ours, so another JSON dropped on the import button fails clearly. */
export const MOD_LIST_FORMAT = 'mc-mod/mod-list'
/** Bumped when a later shape can't be read by this one; older files stay readable. */
export const MOD_LIST_VERSION = 1

const Text = (max: number) => z.string().trim().max(max)

/** The instance a list was made from, and the one it's imported into. */
export const ModListInstance = z.object({
  kind: InstanceKind,
  contentKind: ContentKind,
  gameVersion: GameVersion.nullable(),
  loader: Loader.nullable(),
  loaderVersion: LoaderVersion.nullable(),
  javaVersion: JavaInfo.nullable(),
})
export type ModListInstance = z.infer<typeof ModListInstance>

/** Where a listed mod came from, so the importer can install the same project. */
export const ModListSource = z.object({
  provider: Provider,
  projectId: Text(200).min(1),
  /** The exact file (Modrinth version / CurseForge file id), when the sharer's mc-mod knew it. */
  versionId: Text(200).min(1).optional(),
  versionNumber: Text(200).optional(),
  slug: Text(200).optional(),
  title: Text(200).optional(),
  iconUrl: Text(2000).optional(),
})
export type ModListSource = z.infer<typeof ModListSource>

export const ModListEntry = z.object({
  /** Always the enabled name: `enabled` says whether it was `.disabled` in the folder. */
  fileName: ModFileName,
  /** What the sharer's UI showed: the project title, the jar's name, or the file name. */
  name: Text(200).min(1),
  version: Text(200).optional(),
  enabled: z.boolean(),
  side: Side,
  size: z.number().int().nonnegative(),
  sha1: Sha1.optional(),
  /** Missing for jars that aren't on a platform: those have to be copied over by hand. */
  source: ModListSource.optional(),
})
export type ModListEntry = z.infer<typeof ModListEntry>

/**
 * A shared mod list: what a mod list export writes and an import reads. Files travel between mc-mod
 * versions, so the objects are lenient (unknown fields are dropped, not refused) and every list says
 * which format it is.
 */
export const ModList = z.object({
  format: z.literal(MOD_LIST_FORMAT),
  formatVersion: z.number().int().min(1),
  /** ISO date the list was made. */
  createdAt: z.iso.datetime(),
  generator: z.object({ name: Text(100), version: Text(50) }),
  instance: ModListInstance,
  mods: z.array(ModListEntry).max(1000),
})
export type ModList = z.infer<typeof ModList>

/** `mc-mod-<loader>-<game version>-<date>.json`, the name a shared list is offered under. */
export function modListFileName(instance: ModListInstance, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const parts = [instance.loader, instance.gameVersion, day].filter((p): p is string => Boolean(p))
  return `mc-mod-${parts.join('-')}.json`
}
