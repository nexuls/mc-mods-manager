import {
  type Compatibility,
  type InstalledMod,
  type Instance,
  LOADER_BRIDGES,
  Loader,
  type LoaderBridge,
  type LoaderBridgeId,
  loaderInfo,
  type ModRecord,
  type ModSource,
  type Provider,
  type Side,
  type SideSource,
  type SourceMethod,
} from '@mc-mod/shared'
import type { ScannedJar } from '../jar/scan'
import { rangeContains } from '../lib/mc-version'
import type { HashMatch, ProjectInfo } from '../providers/types'

// Pure identification logic (architecture §7.2): merging sources, the compatibility check and side
// resolution. LibraryService does the I/O around it.

const METHOD_RANK: Record<SourceMethod, number> = {
  'install-record': 0,
  hash: 1,
  manual: 2,
  'launcher-metadata': 3,
}

/** Methods that identify the exact bytes, so they beat a manual link. */
const EXACT: ReadonlySet<SourceMethod> = new Set(['install-record', 'hash'])

/** Applies one platform's hash lookup result to a record. A miss keeps our own install record. */
export function applyLookup(
  record: ModRecord | undefined,
  provider: Provider,
  match: HashMatch | undefined,
  project: ProjectInfo | undefined,
  now: number,
): ModRecord {
  const existing = record?.sources ?? []
  const prev = existing.find((s) => s.provider === provider)
  const others = existing.filter((s) => s.provider !== provider)
  let next: ModSource | undefined
  if (match) {
    next = {
      provider,
      projectId: match.projectId,
      versionId: match.versionId,
      versionNumber: match.versionNumber,
      slug: project?.slug,
      title: project?.title,
      iconUrl: project?.iconUrl,
      loaders: match.loaders,
      gameVersions: match.gameVersions,
      side: match.side ?? (project?.side === 'unknown' ? undefined : project?.side),
      method:
        prev?.method === 'install-record' && prev.projectId === match.projectId
          ? 'install-record'
          : 'hash',
    }
  } else if (prev?.method === 'install-record') {
    next = prev
  }
  return {
    ...record,
    sources: [...others, ...(next ? [next] : [])],
    checkedAt: { ...record?.checkedAt, [provider]: now },
  }
}

/** Key of a fetched project in the maps passed around here: `modrinth:AANobbMI`, `curseforge:238222`. */
export const projectKey = (provider: Provider, id: string) => `${provider}:${id}`

/** Fills title/slug/icon/side of a source from a fetched project, keeping what it already has. */
export function enrich(source: ModSource, project: ProjectInfo | undefined): ModSource {
  if (!project) return source
  return {
    ...source,
    slug: source.slug ?? project.slug,
    title: source.title ?? project.title,
    iconUrl: source.iconUrl ?? project.iconUrl,
    side: source.side ?? (project.side === 'unknown' ? undefined : project.side),
  }
}

export interface MergeInput {
  record: ModRecord | undefined
  launcher: readonly ModSource[]
  preferred: Provider
}

/** All sources for one jar, strongest first, plus whether a manual link was overruled by a hash. */
export function mergeSources({ record, launcher, preferred }: MergeInput): {
  sources: ModSource[]
  conflict: boolean
} {
  if (record?.unlinked) return { sources: [], conflict: false }
  const sources = [...(record?.sources ?? [])]
  let conflict = false

  const manual = record?.manual
  if (manual) {
    const exact = sources.find((s) => s.provider === manual.provider && EXACT.has(s.method))
    if (exact) conflict = exact.projectId !== manual.projectId
    else sources.push({ ...manual, method: 'manual' })
  }
  for (const s of launcher) {
    if (!sources.some((x) => x.provider === s.provider)) sources.push(s)
  }

  sources.sort(
    (a, b) =>
      METHOD_RANK[a.method] - METHOD_RANK[b.method] ||
      Number(b.provider === preferred) - Number(a.provider === preferred),
  )
  return { sources, conflict }
}

/** Loaders whose builds an instance loader can run, besides its own. */
const ALSO_RUNS: Partial<Record<Loader, Loader[]>> = {
  quilt: ['fabric'],
  paper: ['spigot', 'bukkit'],
  purpur: ['paper', 'spigot', 'bukkit'],
  spigot: ['bukkit'],
  waterfall: ['bungeecord'],
}

export function runnableLoaders(loader: Loader, gameVersion: string | null): Loader[] {
  const out = [loader, ...(ALSO_RUNS[loader] ?? [])]
  // NeoForge's first release (1.20.1) still loads Forge mods.
  if (loader === 'neoforge' && gameVersion === '1.20.1') out.push('forge')
  return out
}

/** A build this instance can only run through a compatibility layer, and the layer that runs it. */
export interface BridgedLoader {
  loader: Loader
  bridge: LoaderBridge
}

/**
 * Loaders this instance can run through a translation layer (`domain/bridge.ts`), e.g. Fabric builds on
 * a NeoForge 1.21.1 instance through Sinytra Connector. Loaders it runs natively are never listed here:
 * a bridge is the last resort, and is always presented as one.
 *
 * An unknown game version can't rule a bridge out, so it's offered — the UI says it might not work.
 */
export function bridgedLoaders(loader: Loader, gameVersion: string | null): BridgedLoader[] {
  const runs = runnableLoaders(loader, gameVersion)
  return LOADER_BRIDGES.flatMap((bridge) =>
    !runs.includes(bridge.from) &&
    bridge.targets.some(
      (t) => t.loader === loader && (gameVersion === null || t.gameVersions.includes(gameVersion)),
    )
      ? [{ loader: bridge.from, bridge }]
      : [],
  )
}

/** The bridges installed in a content dir, recognised by the mod ids their jars declare. */
export function detectBridges(jars: readonly Pick<ScannedJar, 'meta'>[]): LoaderBridgeId[] {
  const ids = new Set(jars.flatMap((j) => (j.meta?.id ? [j.meta.id.toLowerCase()] : [])))
  return LOADER_BRIDGES.filter((b) => b.modIds.some((id) => ids.has(id))).map((b) => b.id)
}

function knownLoaders(names: readonly string[]): Loader[] {
  return names.flatMap((n) => {
    const l = Loader.safeParse(n.toLowerCase())
    return l.success ? [l.data] : []
  })
}

function listShort(items: readonly string[], max = 3): string {
  return items.length > max ? `${items.slice(0, max).join(', ')}…` : items.join(', ')
}

/**
 * Compares the platform's loaders/game versions for this exact file (or, without a platform match, the
 * jar's own metadata) with the instance. Plugin game versions aren't checked: `api-version` and platform
 * lists are minimums in practice, and plugins usually keep working on newer servers.
 */
export function checkCompatibility(
  instance: Pick<Instance, 'loader' | 'gameVersion' | 'contentKind'>,
  jar: Pick<ScannedJar, 'meta' | 'minecraft'>,
  sources: readonly ModSource[],
  /** Bridges actually installed here, so the reason can say "runs through" rather than "needs". */
  installedBridges: readonly LoaderBridgeId[] = [],
): CompatibilityVerdict {
  const { loader, gameVersion } = instance
  if (!loader || loader === 'vanilla') return { compatibility: 'unknown' }
  const checkVersions = instance.contentKind === 'mod' && gameVersion !== null
  const fits = (loaders: readonly Loader[]) =>
    loaderVerdict(loaders, loader, gameVersion, installedBridges)

  const platform = sources.find((s) => EXACT.has(s.method) && s.loaders)
  if (platform) {
    const loaders = knownLoaders(platform.loaders ?? [])
    const verdict = fits(loaders)
    if (verdict?.compatibility === 'wrong-loader') return verdict
    const versions = platform.gameVersions ?? []
    if (checkVersions && versions.length > 0 && !versions.includes(gameVersion)) {
      return { compatibility: 'wrong-game-version', reason: `Made for ${listShort(versions)}` }
    }
    if (verdict) return verdict
    return { compatibility: loaders.length > 0 || versions.length > 0 ? 'ok' : 'unknown' }
  }

  const loaders = knownLoaders(jar.meta?.loaders ?? [])
  if (loaders.length === 0) return { compatibility: 'unknown' }
  const verdict = fits(loaders)
  if (verdict?.compatibility === 'wrong-loader') return verdict
  if (checkVersions && jar.minecraft && !rangeContains(jar.minecraft, gameVersion)) {
    const named = [...new Set(jar.minecraft.candidates)]
    return {
      compatibility: 'wrong-game-version',
      reason: named.length
        ? `Declares Minecraft ${listShort(named)}`
        : 'Declares another Minecraft version',
    }
  }
  return verdict ?? { compatibility: 'ok' }
}

export interface CompatibilityVerdict {
  compatibility: Compatibility
  reason?: string
  bridge?: LoaderBridgeId
}

/**
 * What the loaders a file was built for mean for this instance: undefined when one of them runs
 * natively, a `bridged` verdict when a translation layer covers it, else `wrong-loader`. An empty list
 * says nothing either way.
 */
function loaderVerdict(
  loaders: readonly Loader[],
  loader: Loader,
  gameVersion: string | null,
  installedBridges: readonly LoaderBridgeId[],
): CompatibilityVerdict | undefined {
  if (loaders.length === 0) return undefined
  if (loaders.some((l) => runnableLoaders(loader, gameVersion).includes(l))) return undefined
  const bridged = bridgedLoaders(loader, gameVersion).find((b) => loaders.includes(b.loader))
  if (bridged) {
    const { bridge } = bridged
    const via = installedBridges.includes(bridge.id)
      ? `runs through ${bridge.label}`
      : `needs ${bridge.label}`
    return {
      compatibility: 'bridged',
      reason: `${loaderInfo[bridged.loader].label} build — ${via}`,
      bridge: bridge.id,
    }
  }
  const labels = loaders.map((l) => loaderInfo[l].label)
  return { compatibility: 'wrong-loader', reason: `Built for ${listShort(labels)}` }
}

/**
 * Side: platform (primary source first) > user override > jar metadata > unknown. The platform's answer
 * wins, so an override only counts for local files or when the platform doesn't know the side.
 */
export function resolveSide(
  override: Side | undefined,
  sources: readonly ModSource[],
  primary: Provider | undefined,
  jarSide: Side | undefined,
): { side: Side; sideSource: SideSource } {
  const ordered = [...sources].sort(
    (a, b) => Number(b.provider === primary) - Number(a.provider === primary),
  )
  const platform = ordered.find((s) => s.side && s.side !== 'unknown')?.side
  if (platform) return { side: platform, sideSource: 'platform' }
  if (override) return { side: override, sideSource: 'override' }
  if (jarSide && jarSide !== 'unknown') return { side: jarSide, sideSource: 'jar' }
  return { side: 'unknown', sideSource: 'unknown' }
}

export function buildInstalledMod(input: {
  jar: ScannedJar
  record: ModRecord | undefined
  launcher: readonly ModSource[]
  instance: Pick<Instance, 'loader' | 'gameVersion' | 'contentKind'>
  preferred: Provider
  /** Projects fetched this run, keyed by `projectKey`. */
  projects: ReadonlyMap<string, ProjectInfo>
  /** Compatibility layers installed in this content dir (`detectBridges`). */
  bridges?: readonly LoaderBridgeId[]
}): InstalledMod {
  const { jar, record, preferred } = input
  const merged = mergeSources({ record, launcher: input.launcher, preferred })
  const sources = merged.sources.map((s) =>
    enrich(s, input.projects.get(projectKey(s.provider, s.projectId))),
  )
  const has = (p: Provider | undefined) => p !== undefined && sources.some((s) => s.provider === p)
  const pinned = has(record?.primarySource)
  const primarySource = pinned
    ? record?.primarySource
    : has(preferred)
      ? preferred
      : sources[0]?.provider
  const { compatibility, reason, bridge } = checkCompatibility(
    input.instance,
    jar,
    sources,
    input.bridges,
  )
  return {
    fileName: jar.fileName,
    enabled: jar.enabled,
    size: jar.size,
    sha1: jar.sha1,
    sha512: jar.sha512,
    cfFingerprint: jar.cfFingerprint,
    meta: jar.meta,
    sources,
    primarySource,
    primaryPinned: pinned,
    unlinked: record?.unlinked ?? false,
    conflict: merged.conflict,
    compatibility,
    compatibilityReason: reason,
    bridge,
    ...resolveSide(record?.sideOverride, sources, primarySource, jar.meta?.side),
  }
}
