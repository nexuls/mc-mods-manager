import { z } from 'zod'
import { LoaderBridgeId } from './bridge'
import { JarMeta } from './jar-meta'
import { Side } from './side'

export const Provider = z.enum(['modrinth', 'curseforge'])
export type Provider = z.infer<typeof Provider>

export const providerLabel: Record<Provider, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
}

/** A jar in the content dir: `name.jar`, or `name.jar.disabled` when disabled. Never a path. */
export const ModFileName = z
  .string()
  .max(255)
  .regex(/^[^/\\]+\.jar(\.disabled)?$/i, 'Must be a .jar or .jar.disabled file name')
  .refine((n) => !n.startsWith('.'), 'Must not start with a dot')

export const Sha1 = z.string().regex(/^[0-9a-f]{40}$/)
export const Sha512 = z.string().regex(/^[0-9a-f]{128}$/)
/** CurseForge's murmur2 fingerprint, an unsigned 32-bit integer. */
export const CfFingerprint = z.number().int().min(0).max(0xffffffff)

/**
 * How a source was found (artifacts/architecture.md §7.2), strongest first:
 * - `install-record`: mc-mod installed this exact file
 * - `hash`: the platform knows this exact file (Modrinth sha1 / CurseForge fingerprint)
 * - `manual`: the user linked it
 * - `launcher-metadata`: another launcher recorded it (packwiz, CurseForge app, ATLauncher)
 */
export const SourceMethod = z.enum(['install-record', 'hash', 'manual', 'launcher-metadata'])
export type SourceMethod = z.infer<typeof SourceMethod>

/** Where an installed jar comes from on one platform. */
export const ModSource = z.strictObject({
  provider: Provider,
  projectId: z.string().min(1),
  /** The platform's version (Modrinth) or file (CurseForge) id, when the exact file is known. */
  versionId: z.string().min(1).optional(),
  versionNumber: z.string().optional(),
  slug: z.string().optional(),
  title: z.string().optional(),
  iconUrl: z.string().optional(),
  /** Loaders and game versions the platform lists for this file, for the compatibility check. */
  loaders: z.array(z.string()).optional(),
  gameVersions: z.array(z.string()).optional(),
  /** Where the platform says the mod runs. */
  side: Side.optional(),
  method: SourceMethod,
})
export type ModSource = z.infer<typeof ModSource>

/** `bridged`: built for another loader, but a compatibility layer can run it here (`bridge` says which). */
export const Compatibility = z.enum([
  'ok',
  'bridged',
  'wrong-loader',
  'wrong-game-version',
  'unknown',
])
export type Compatibility = z.infer<typeof Compatibility>

/** A newer version of an installed mod, from its primary source (found by "Check updates"). */
export const ModUpdate = z.strictObject({
  provider: Provider,
  projectId: z.string().min(1),
  versionId: z.string().min(1),
  versionNumber: z.string(),
  /** ISO date. */
  publishedAt: z.string(),
  /** The file it installs as. */
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  /**
   * The author only allows downloads from the platform's website (CurseForge): the user downloads it
   * from `pageUrl`, and "Update all" leaves it out.
   */
  manual: z.boolean(),
  /** The version's page on the platform. */
  pageUrl: z.string().optional(),
})
export type ModUpdate = z.infer<typeof ModUpdate>

/** Which rule decided `InstalledMod.side`. */
export const SideSource = z.enum(['override', 'platform', 'jar', 'unknown'])
export type SideSource = z.infer<typeof SideSource>

export const InstalledMod = z.strictObject({
  fileName: ModFileName,
  enabled: z.boolean(),
  size: z.number().int().nonnegative(),
  sha1: Sha1,
  sha512: Sha512,
  cfFingerprint: CfFingerprint,
  /** Jar metadata; null when the file isn't a readable jar. */
  meta: JarMeta.nullable(),
  /** 0..2 entries, strongest method first. The same file is often on both platforms. */
  sources: z.array(ModSource),
  /** The source used for updates and "open page". */
  primarySource: Provider.optional(),
  /** The user pinned `primarySource` for this mod. */
  primaryPinned: z.boolean(),
  /** The user chose "treat as local": sources are hidden. */
  unlinked: z.boolean(),
  /** A manual link disagrees with an exact hash match (the hash wins). */
  conflict: z.boolean(),
  compatibility: Compatibility,
  /** Why it's incompatible or bridged, e.g. `Built for Forge`. */
  compatibilityReason: z.string().optional(),
  /** The compatibility layer it runs through, when `compatibility` is `bridged`. */
  bridge: LoaderBridgeId.optional(),
  side: Side,
  sideSource: SideSource,
  /** Set after "Check updates" when the primary source has a newer fitting version. */
  update: ModUpdate.optional(),
})
export type InstalledMod = z.infer<typeof InstalledMod>

/** A "possible match" for a jar no exact lookup identified. Never applied without the user. */
export const ModSuggestion = z.strictObject({
  provider: Provider,
  projectId: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  iconUrl: z.string().optional(),
  author: z.string().optional(),
  downloads: z.number().optional(),
  /** Why it was suggested, e.g. `Same mod id` or `Name search`. */
  reason: z.string(),
})
export type ModSuggestion = z.infer<typeof ModSuggestion>
