import { z } from 'zod'
import { LoaderBridgeId } from '../domain/bridge'
import { ModFileName, Provider } from '../domain/mod'
import { ModList, ModListInstance } from '../domain/mod-list'
import { Side } from '../domain/side'
import { defineEndpoint } from './define'

/** The current instance as a mod list file, for the user to save and pass on. */
export const exportList = defineEndpoint({
  method: 'GET',
  path: '/api/share/export',
  response: ModList,
})

/**
 * What importing one listed mod would do:
 * - `install`: a version that fits this instance was found and can be downloaded
 * - `installed`: this project is already in the folder (the same file, or another version)
 * - `manual`: a version fits, but its author only allows downloads from the platform's website
 * - `incompatible`: a file can still be downloaded, but nothing about it fits this instance; the
 *   user can take it anyway ("install everything")
 * - `unavailable`: the platform has no file for it at all (or CurseForge has no key); see `reason`
 * - `local`: the list has no platform for it, so only the sharer can hand the jar over
 */
export const ImportStatus = z.enum([
  'install',
  'installed',
  'manual',
  'incompatible',
  'unavailable',
  'local',
])
export type ImportStatus = z.infer<typeof ImportStatus>

/** One file an import could take for a listed mod. */
export const ImportCandidate = z.strictObject({
  versionId: z.string(),
  versionNumber: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  /** Runs on this instance — through `bridge` when one is set. */
  compatible: z.boolean(),
  /** The compatibility layer it would run through (`domain/bridge.ts`). */
  bridge: LoaderBridgeId.optional(),
  /** The author only allows downloads from the platform's website; take it from `pageUrl` by hand. */
  manual: z.boolean(),
  pageUrl: z.string().optional(),
  /** What's worth knowing about this file, e.g. `Made for 1.20.1`, `Fabric build · needs …`. */
  note: z.string().optional(),
})
export type ImportCandidate = z.infer<typeof ImportCandidate>

export const ImportItem = z.strictObject({
  /** The list's file name; also the item's id in the dialog's selection. */
  fileName: ModFileName,
  title: z.string(),
  iconUrl: z.string().optional(),
  side: Side,
  /** The mod was disabled in the instance the list came from. */
  enabled: z.boolean(),
  /** What would happen with the default choice of version (`shared`). */
  status: ImportStatus,
  provider: Provider.optional(),
  projectId: z.string().optional(),
  /** The version number in the list, whichever file is actually taken. */
  listedVersion: z.string().optional(),
  /**
   * The exact file the list pinned — the version that was running on the machine the list came from.
   * It's the default, so an import reproduces that setup rather than jumping everyone to the newest
   * build; updating afterwards is a separate, deliberate step in Installed.
   */
  shared: ImportCandidate.optional(),
  /** The best version for *this* instance, when that's another file. */
  best: ImportCandidate.optional(),
  /** Why it's installed, unavailable or local. */
  reason: z.string().optional(),
})
export type ImportItem = z.infer<typeof ImportItem>

/** Which file an import takes for each mod. */
export const ImportVersionMode = z.enum(['shared', 'best'])
export type ImportVersionMode = z.infer<typeof ImportVersionMode>

/**
 * The file an import would take for one mod. `shared` prefers the pinned version and only moves off it
 * when it doesn't fit here; `best` prefers what fits this instance. Either way a version that runs
 * beats one that doesn't, and something beats nothing.
 */
export function importCandidate(
  item: Pick<ImportItem, 'shared' | 'best'>,
  mode: ImportVersionMode,
): ImportCandidate | undefined {
  const [first, second] = mode === 'shared' ? [item.shared, item.best] : [item.best, item.shared]
  if (first?.compatible) return first
  if (second?.compatible) return second
  return first ?? second
}

/** What would happen to one item with a given choice of version. Settled statuses pass through. */
export function importStatus(item: ImportItem, mode: ImportVersionMode): ImportStatus {
  if (item.status === 'installed' || item.status === 'local') return item.status
  const candidate = importCandidate(item, mode)
  if (!candidate) return item.status === 'unavailable' ? 'unavailable' : 'incompatible'
  if (!candidate.compatible) return 'incompatible'
  return candidate.manual ? 'manual' : 'install'
}

/** How one property of the two instances compares. `unknown`: one of the sides doesn't know it. */
export const ImportMatch = z.enum(['same', 'differs', 'unknown'])
export type ImportMatch = z.infer<typeof ImportMatch>

export const ImportCheck = z.strictObject({
  label: z.string(),
  /** The list's value and this instance's, as the UI shows them; null when unknown. */
  theirs: z.string().nullable(),
  ours: z.string().nullable(),
  match: ImportMatch,
})
export type ImportCheck = z.infer<typeof ImportCheck>

export const ImportPlan = z.strictObject({
  createdAt: z.string(),
  generator: z.strictObject({ name: z.string(), version: z.string() }),
  from: ModListInstance,
  to: ModListInstance,
  /** Game version, loader, loader version and Java, side by side. */
  checks: z.array(ImportCheck),
  /** One per listed mod, in the list's order. */
  items: z.array(ImportItem),
  /** Compatibility layers installed here, so the dialog knows a bridged pick will really load. */
  bridges: z.array(LoaderBridgeId),
  /** Mismatches and anything that keeps part of the list from being installed. */
  warnings: z.array(z.string()),
})
export type ImportPlan = z.infer<typeof ImportPlan>

/**
 * Works out what a shared list would install here, without touching disk: versions are re-picked for
 * this instance, and mods that are already installed are marked so they can be skipped.
 */
export const importPlan = defineEndpoint({
  method: 'POST',
  path: '/api/share/import',
  body: z.strictObject({ list: ModList }),
  response: ImportPlan,
})
