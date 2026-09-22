import { z } from 'zod'
import { InstanceOverrides } from './instance'
import { JarMeta, VersionRange } from './jar-meta'
import { CfFingerprint, ModSource, Provider, Sha1, Sha512 } from './mod'
import { Side } from './side'

/** Hashes and metadata of one jar, reused while its size and mtime are unchanged. */
export const JarCacheEntry = z.looseObject({
  size: z.number().int().nonnegative(),
  mtimeMs: z.number(),
  sha1: Sha1,
  sha512: Sha512,
  cfFingerprint: CfFingerprint,
  meta: JarMeta.nullable(),
  minecraft: VersionRange.nullable(),
})
export type JarCacheEntry = z.infer<typeof JarCacheEntry>

export const JarCache = z.strictObject({
  /** Bumped by mc-mod when jar parsing changes, which invalidates every entry. */
  version: z.number().int(),
  /** Keyed by file name without `.disabled`, so enabling/disabling a mod keeps its entry. */
  files: z.record(z.string(), JarCacheEntry),
})
export type JarCache = z.infer<typeof JarCache>

/** What mc-mod knows about one exact file, keyed by its sha1. */
export const ModRecord = z.looseObject({
  /** Found by hash lookups or written on install. Refreshed by every lookup. */
  sources: z.array(ModSource).optional(),
  /** When each platform last looked this hash up (epoch ms), including misses. */
  checkedAt: z.partialRecord(Provider, z.number()).optional(),
  /** The user linked it by hand (`method: "manual"`). */
  manual: ModSource.optional(),
  /** The user chose "treat as local". */
  unlinked: z.boolean().optional(),
  sideOverride: Side.optional(),
  primarySource: Provider.optional(),
})
export type ModRecord = z.infer<typeof ModRecord>

/**
 * `<instance>/.mc-mod/state.json`. A cache/annotation layer: deleting it must never break anything.
 * Loose at the top level so fields written by a newer mc-mod survive a round trip through an older one.
 */
export const State = z.looseObject({
  schemaVersion: z.literal(1),
  instance: InstanceOverrides.optional(),
  /** Pure cache: dropped rather than failing the whole file when it doesn't parse. */
  jarCache: JarCache.optional().catch(undefined),
  mods: z.record(Sha1, ModRecord).optional(),
})
export type State = z.infer<typeof State>

export const emptyState = (): State => ({ schemaVersion: 1 })
