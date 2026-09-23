import { z } from 'zod'
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
 * - `unavailable`: no version of it fits this instance (or CurseForge has no key); see `reason`
 * - `local`: the list has no platform for it, so only the sharer can hand the jar over
 */
export const ImportStatus = z.enum(['install', 'installed', 'manual', 'unavailable', 'local'])
export type ImportStatus = z.infer<typeof ImportStatus>

export const ImportItem = z.strictObject({
  /** The list's file name; also the item's id in `ImportBody.fileNames`. */
  fileName: ModFileName,
  title: z.string(),
  iconUrl: z.string().optional(),
  side: Side,
  /** The mod was disabled in the instance the list came from. */
  enabled: z.boolean(),
  status: ImportStatus,
  provider: Provider.optional(),
  projectId: z.string().optional(),
  /** The version in the list, whether or not it's the one that would be installed. */
  listedVersion: z.string().optional(),
  /** What would be installed (`install` and `manual` items). */
  versionId: z.string().optional(),
  versionNumber: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  /** A difference worth seeing, e.g. `Newer build for this instance`. */
  note: z.string().optional(),
  /** Why it's installed, unavailable, manual or local. */
  reason: z.string().optional(),
  /** The version's page on the platform, for `manual` items. */
  pageUrl: z.string().optional(),
})
export type ImportItem = z.infer<typeof ImportItem>

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
