import path from 'node:path'
import type { Loader } from '@mc-mod/shared'
import { z } from 'zod'
import { readJson } from './fs'
import type { Finding, Layout } from './types'

// Launcher manifests. Schemas are loose and cover only the fields we read.

const PRISM_COMPONENTS: Record<string, Loader> = {
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt',
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge',
}

const MmcPack = z.looseObject({
  components: z.array(z.looseObject({ uid: z.string(), version: z.string().optional() })),
})

/** Prism Launcher / MultiMC: `mmc-pack.json`. */
export async function detectPrism({ root }: Layout): Promise<Finding[]> {
  const file = path.join(root, 'mmc-pack.json')
  const parsed = MmcPack.safeParse(await readJson(file))
  if (!parsed.success) return []
  const { components } = parsed.data
  const mc = components.find((c) => c.uid === 'net.minecraft')
  const loader = components.find((c) => c.uid in PRISM_COMPONENTS)
  return [
    {
      source: 'Prism/MultiMC instance (mmc-pack.json)',
      confidence: 'high',
      detail: file,
      kind: 'client',
      gameVersion: mc?.version,
      loader: loader ? (PRISM_COMPONENTS[loader.uid] ?? 'vanilla') : 'vanilla',
      loaderVersion: loader?.version,
    },
  ]
}

const MinecraftInstance = z.looseObject({
  gameVersion: z.string().optional(),
  baseModLoader: z
    .looseObject({ name: z.string().optional(), minecraftVersion: z.string().optional() })
    .nullable()
    .optional(),
})

/**
 * `baseModLoader.name` looks like `forge-47.2.0`, `neoforge-21.1.77` or `fabric-0.15.0-1.20.1`.
 */
export function parseCurseForgeLoader(
  name: string,
): { loader: Loader; version: string } | undefined {
  const m = /^(forge|neoforge|fabric|quilt)-([^-]+)/i.exec(name)
  if (!m?.[1] || !m[2]) return undefined
  const loader = m[1].toLowerCase()
  const known = { forge: 'forge', neoforge: 'neoforge', fabric: 'fabric', quilt: 'quilt' } as const
  return loader in known
    ? { loader: known[loader as keyof typeof known], version: m[2] }
    : undefined
}

/** CurseForge app: `minecraftinstance.json`. */
export async function detectCurseForgeApp({ root }: Layout): Promise<Finding[]> {
  const file = path.join(root, 'minecraftinstance.json')
  const parsed = MinecraftInstance.safeParse(await readJson(file))
  if (!parsed.success) return []
  const base = parsed.data.baseModLoader
  const loader = base?.name ? parseCurseForgeLoader(base.name) : undefined
  return [
    {
      source: 'CurseForge app instance (minecraftinstance.json)',
      confidence: 'high',
      detail: file,
      kind: 'client',
      gameVersion: parsed.data.gameVersion ?? base?.minecraftVersion,
      loader: loader?.loader ?? 'vanilla',
      loaderVersion: loader?.version,
    },
  ]
}

const AtLauncherInstance = z.looseObject({
  id: z.string().optional(),
  minecraftVersion: z.string().optional(),
  launcher: z.looseObject({
    loaderVersion: z
      .looseObject({ type: z.string().optional(), version: z.string().optional() })
      .nullable()
      .optional(),
  }),
})

/** ATLauncher: `instance.json` with a `launcher` section. */
export async function detectAtLauncher({ root }: Layout): Promise<Finding[]> {
  const file = path.join(root, 'instance.json')
  const parsed = AtLauncherInstance.safeParse(await readJson(file))
  if (!parsed.success) return []
  const { id, minecraftVersion, launcher } = parsed.data
  const type = launcher.loaderVersion?.type?.toLowerCase()
  const loader = Object.values(PRISM_COMPONENTS).find((l) => l === type)
  return [
    {
      source: 'ATLauncher instance (instance.json)',
      confidence: 'high',
      detail: file,
      kind: 'client',
      gameVersion: minecraftVersion ?? id,
      loader: loader ?? (launcher.loaderVersion ? undefined : 'vanilla'),
      loaderVersion: launcher.loaderVersion?.version,
    },
  ]
}

const ModrinthProfile = z.looseObject({
  metadata: z.looseObject({
    game_version: z.string(),
    loader: z.string().optional(),
    loader_version: z.looseObject({ id: z.string().optional() }).nullable().optional(),
  }),
})

/** Modrinth App (older versions): `profile.json`. Newer ones keep this in the app's database. */
export async function detectModrinthApp({ root }: Layout): Promise<Finding[]> {
  const file = path.join(root, 'profile.json')
  const parsed = ModrinthProfile.safeParse(await readJson(file))
  if (!parsed.success) return []
  const { game_version, loader, loader_version } = parsed.data.metadata
  const known = Object.values(PRISM_COMPONENTS).find((l) => l === loader)
  return [
    {
      source: 'Modrinth App profile (profile.json)',
      confidence: 'high',
      detail: file,
      kind: 'client',
      gameVersion: game_version,
      loader: known ?? (loader === 'vanilla' ? 'vanilla' : undefined),
      loaderVersion: loader_version?.id,
    },
  ]
}
