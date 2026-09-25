import {
  bridgeInfo,
  type ContentKind,
  type Loader,
  type LoaderBridgeId,
  loaderInfo,
  type ProjectVersion,
  type RankedVersion,
  type VersionType,
} from '@mc-mod/shared'
import { compareVersions } from '../lib/mc-version'
import { bridgedLoaders, runnableLoaders } from './identify'

// Picking "the perfect version" (architecture §7.3). Pure, so the rules are easy to test.

export interface VersionContext {
  loader: Loader | null
  gameVersion: string | null
  contentKind: ContentKind
  /** Betas and alphas compete with releases on date alone. Off: releases win. */
  allowPrerelease: boolean
  /** Compatibility layers installed in this instance, from the last scan of the content dir. */
  bridges?: readonly LoaderBridgeId[]
}

/**
 * How well a file's loader fits: its own, one this loader also runs, or one only a translation layer
 * runs (`bridged`, e.g. a Fabric build on NeoForge through Sinytra Connector).
 */
type LoaderFit = 'native' | 'fallback' | 'bridged' | 'none'
type GameFit = 'exact' | 'older' | 'none'

const CHANNEL_RANK: Record<VersionType, number> = { release: 0, beta: 1, alpha: 2 }
const LOADER_RANK: Record<LoaderFit, number> = { native: 0, fallback: 1, bridged: 2, none: 3 }

function loaderFit(
  v: ProjectVersion,
  ctx: VersionContext,
): { fit: LoaderFit; via?: Loader; bridge?: LoaderBridgeId } {
  const { loader } = ctx
  // Without a loader (vanilla or not set up) there's nothing to check against.
  if (!loader || loader === 'vanilla') return { fit: 'native' }
  const listed = v.loaders.map((l) => l.toLowerCase())
  if (listed.includes(loader)) return { fit: 'native' }
  const via = runnableLoaders(loader, ctx.gameVersion).find((l) => listed.includes(l))
  if (via) return { fit: 'fallback', via }
  const bridged = bridgedLoaders(loader, ctx.gameVersion).find((b) => listed.includes(b.loader))
  return bridged
    ? { fit: 'bridged', via: bridged.loader, bridge: bridged.bridge.id }
    : { fit: 'none' }
}

/**
 * Mods must list the exact game version. Plugin versions are minimums in practice, so a plugin made for
 * an older version still counts (as `older`).
 */
function gameFit(v: ProjectVersion, ctx: VersionContext): { fit: GameFit; newest?: string } {
  const { gameVersion } = ctx
  if (!gameVersion || v.gameVersions.includes(gameVersion)) return { fit: 'exact' }
  if (ctx.contentKind !== 'plugin') return { fit: 'none' }
  const older = v.gameVersions
    .filter((g) => compareVersions(g, gameVersion) < 0)
    .sort(compareVersions)
  const newest = older.at(-1)
  return newest ? { fit: 'older', newest } : { fit: 'none' }
}

/**
 * Marks each version compatible or not and recommends the best one. Order of preference: a build for the
 * instance's own loader (a compatible loader's build only when there's none), the exact game version,
 * release over beta over alpha (unless pre-releases are allowed), then the newest. Versions without an
 * installable file are never recommended. Keeps the input order.
 */
export function rankVersions(
  versions: readonly ProjectVersion[],
  ctx: VersionContext,
): RankedVersion[] {
  const scored = versions.map((v) => {
    const l = loaderFit(v, ctx)
    const g = gameFit(v, ctx)
    const compatible = l.fit !== 'none' && g.fit !== 'none'
    const notes: string[] = []
    if (compatible && l.via) notes.push(`${loaderInfo[l.via].label} build`)
    if (compatible && l.bridge) {
      notes.push(
        ctx.bridges?.includes(l.bridge)
          ? `runs through ${bridgeInfo[l.bridge].label}`
          : `needs ${bridgeInfo[l.bridge].label}`,
      )
    }
    if (compatible && g.newest) notes.push(`Made for ${g.newest}`)
    return { v, l, g, compatible, note: notes.join(' · ') || undefined }
  })

  const candidates = scored.filter((s) => s.compatible && s.v.file)
  candidates.sort(
    (a, b) =>
      LOADER_RANK[a.l.fit] - LOADER_RANK[b.l.fit] ||
      Number(a.g.fit === 'older') - Number(b.g.fit === 'older') ||
      (ctx.allowPrerelease ? 0 : CHANNEL_RANK[a.v.type] - CHANNEL_RANK[b.v.type]) ||
      (a.g.newest && b.g.newest ? compareVersions(b.g.newest, a.g.newest) : 0) ||
      Date.parse(b.v.publishedAt) - Date.parse(a.v.publishedAt),
  )
  const best = candidates[0]?.v

  return scored.map((s) => ({
    ...s.v,
    compatible: s.compatible,
    recommended: s.v === best,
    note: s.note,
    bridge: s.compatible ? s.l.bridge : undefined,
  }))
}

/** The recommended version, if any version fits. */
export function pickBest(
  versions: readonly ProjectVersion[],
  ctx: VersionContext,
): RankedVersion | undefined {
  return rankVersions(versions, ctx).find((v) => v.recommended)
}

/**
 * Loaders to ask the platform for: the instance's own, the ones it can also run, and the ones a
 * translation layer runs.
 *
 * `bridged` decides when that last group counts. Listing one project's versions always includes them
 * (`bridged: true`): the user named that project, so "no version for this instance" would be hiding
 * the only answer there is, and `rankVersions` labels the build with the layer it needs. A *search*
 * leaves them out until the layer is actually installed — otherwise every Fabric mod would bury the
 * builds a bare NeoForge instance can really load.
 */
export function queryLoaders(
  ctx: Pick<VersionContext, 'loader' | 'gameVersion' | 'bridges'>,
  options: { bridged?: boolean } = {},
): Loader[] {
  const { loader } = ctx
  if (!loader || loader === 'vanilla') return []
  const installed = ctx.bridges ?? []
  return [
    ...runnableLoaders(loader, ctx.gameVersion),
    ...bridgedLoaders(loader, ctx.gameVersion)
      .filter((b) => options.bridged || installed.includes(b.bridge.id))
      .map((b) => b.loader),
  ]
}
