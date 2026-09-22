import {
  type ContentKind,
  type Loader,
  loaderInfo,
  type ProjectVersion,
  type RankedVersion,
  type VersionType,
} from '@mc-mod/shared'
import { compareVersions } from '../lib/mc-version'
import { runnableLoaders } from './identify'

// Picking "the perfect version" (architecture §7.3). Pure, so the rules are easy to test.

export interface VersionContext {
  loader: Loader | null
  gameVersion: string | null
  contentKind: ContentKind
  /** Betas and alphas compete with releases on date alone. Off: releases win. */
  allowPrerelease: boolean
}

type LoaderFit = 'native' | 'fallback' | 'none'
type GameFit = 'exact' | 'older' | 'none'

const CHANNEL_RANK: Record<VersionType, number> = { release: 0, beta: 1, alpha: 2 }

function loaderFit(v: ProjectVersion, ctx: VersionContext): { fit: LoaderFit; via?: Loader } {
  const { loader } = ctx
  // Without a loader (vanilla or not set up) there's nothing to check against.
  if (!loader || loader === 'vanilla') return { fit: 'native' }
  const listed = v.loaders.map((l) => l.toLowerCase())
  if (listed.includes(loader)) return { fit: 'native' }
  const via = runnableLoaders(loader, ctx.gameVersion).find((l) => listed.includes(l))
  return via ? { fit: 'fallback', via } : { fit: 'none' }
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
    if (compatible && g.newest) notes.push(`Made for ${g.newest}`)
    return { v, l, g, compatible, note: notes.join(' · ') || undefined }
  })

  const candidates = scored.filter((s) => s.compatible && s.v.file)
  candidates.sort(
    (a, b) =>
      Number(a.l.fit === 'fallback') - Number(b.l.fit === 'fallback') ||
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
  }))
}

/** The recommended version, if any version fits. */
export function pickBest(
  versions: readonly ProjectVersion[],
  ctx: VersionContext,
): RankedVersion | undefined {
  return rankVersions(versions, ctx).find((v) => v.recommended)
}

/** Loaders to ask the platform for: the instance's own and the ones it can also run. */
export function queryLoaders(ctx: Pick<VersionContext, 'loader' | 'gameVersion'>): Loader[] {
  const { loader } = ctx
  return loader && loader !== 'vanilla' ? runnableLoaders(loader, ctx.gameVersion) : []
}
