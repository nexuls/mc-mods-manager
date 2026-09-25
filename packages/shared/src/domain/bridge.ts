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

/** One host loader a bridge covers, and the game versions it covers there. Bounds are inclusive. */
export interface BridgeTarget {
  loader: Loader
  minGameVersion?: string
  maxGameVersion?: string
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
 * `890127` on CurseForge, built for Forge on 1.20.1 and NeoForge from 1.21 on, and its jar declares
 * the mod id `connector` (`connectormod` in the 1.20.1 line).
 */
export const LOADER_BRIDGES: readonly LoaderBridge[] = [
  {
    id: 'sinytra-connector',
    label: 'Sinytra Connector',
    from: 'fabric',
    targets: [
      { loader: 'forge', minGameVersion: '1.20.1', maxGameVersion: '1.20.1' },
      { loader: 'neoforge', minGameVersion: '1.21' },
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
