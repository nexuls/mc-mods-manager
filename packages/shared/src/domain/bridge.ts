import { z } from 'zod'
import type { Loader } from './loader'
// Type-only: `mod.ts` imports `LoaderBridgeId` from here, and a value import would be a cycle.
import type { Provider } from './mod'

/**
 * Compatibility layers ("translation layers") that let one loader run another's builds. Modrinth and
 * CurseForge only ever list the loader a file was *built* for, so without this table a Fabric mod on a
 * NeoForge instance looks like it simply doesn't exist for that instance — which is what a Connector
 * user sees when they try to install the mods they already run.
 *
 * A bridge is never as certain as a native build: it's offered, marked, and always ranked below one.
 */
export const LoaderBridgeId = z.enum(['sinytra-connector'])
export type LoaderBridgeId = z.infer<typeof LoaderBridgeId>

/**
 * One host loader a bridge covers, and the exact game versions it covers there — the versions the
 * bridge itself has builds for. A list rather than a range: a range would claim 1.21.8 for a layer
 * that stops at 1.21.1, and telling someone a mod "needs Sinytra Connector" when no Connector exists
 * for their version is worse than saying nothing.
 */
export interface BridgeTarget {
  loader: Loader
  gameVersions: readonly string[]
}

export interface LoaderBridge {
  id: LoaderBridgeId
  label: string
  /** The loader whose builds it runs. */
  from: Loader
  /** The instance loaders that can host it. */
  targets: readonly BridgeTarget[]
  /** Mod ids the jar declares, so an installed bridge is recognised without asking a platform. */
  modIds: readonly string[]
  /** The bridge itself on the platforms, for "install it" links. */
  projects: readonly { provider: Provider; projectId: string; slug: string }[]
  url: string
  /** One line the UI shows next to anything that would run through it. */
  caveat: string
}

/**
 * Checked against the live platforms on 2026-09-25: Sinytra Connector is `u58R1TMW` on Modrinth and
 * `890127` on CurseForge, its jar declares the mod id `connector` (`connectormod` in the 1.20.1 line),
 * and Modrinth lists its builds for 1.20.1 (Forge) and 1.21, 1.21.1 and 26.1.2 (NeoForge).
 *
 * `gameVersions` is what will go stale here: refresh it from
 * https://api.modrinth.com/v2/project/connector when a layer picks up new versions.
 */
export const LOADER_BRIDGES: readonly LoaderBridge[] = [
  {
    id: 'sinytra-connector',
    label: 'Sinytra Connector',
    from: 'fabric',
    targets: [
      { loader: 'forge', gameVersions: ['1.20.1'] },
      { loader: 'neoforge', gameVersions: ['1.21', '1.21.1', '26.1.2'] },
    ],
    modIds: ['connector', 'connectormod'],
    projects: [
      { provider: 'modrinth', projectId: 'u58R1TMW', slug: 'connector' },
      { provider: 'curseforge', projectId: '890127', slug: 'sinytra-connector' },
    ],
    url: 'https://modrinth.com/mod/connector',
    caveat:
      'Needs Forgified Fabric API, and mods that patch the game deeply can still fail to load.',
  },
]

export const bridgeInfo: Record<LoaderBridgeId, LoaderBridge> = Object.fromEntries(
  LOADER_BRIDGES.map((b) => [b.id, b]),
) as Record<LoaderBridgeId, LoaderBridge>
