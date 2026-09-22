import path from 'node:path'
import type { Loader, Suggestion } from '@mc-mod/shared'
import { z } from 'zod'
import { samePath } from '../paths'
import { list, readJson } from './fs'
import type { Finding, Layout } from './types'

// Vanilla-launcher style `versions/<id>/<id>.json` (also written by TLauncher and the Forge/NeoForge/
// Fabric installers), found through a launcher profile, TLauncher's `home/<id>` game dirs, or the path.

const Arg = z.union([
  z.string(),
  z.looseObject({ value: z.union([z.string(), z.array(z.string())]) }),
])

const VersionJson = z.looseObject({
  id: z.string(),
  inheritsFrom: z.string().optional(),
  jar: z.string().optional(),
  libraries: z.array(z.looseObject({ name: z.string() })).optional(),
  arguments: z.looseObject({ game: z.array(Arg).optional() }).optional(),
  minecraftArguments: z.string().optional(),
})

export interface VersionInfo {
  id: string
  file: string
  gameVersion: string
  loader: Loader
  loaderVersion?: string
}

const LIBRARY_LOADERS: [RegExp, Loader][] = [
  [/^net\.neoforged:neoforge:([^:]+)/, 'neoforge'],
  [/^net\.neoforged:forge:[^-:]+-([^:]+)/, 'neoforge'], // NeoForge for 1.20.1
  [/^net\.minecraftforge:forge:[^-:]+-([^:]+)/, 'forge'],
  [/^net\.fabricmc:fabric-loader:([^:]+)/, 'fabric'],
  [/^org\.quiltmc:quilt-loader:([^:]+)/, 'quilt'],
]

function gameArgs(v: z.infer<typeof VersionJson>): string[] {
  const modern = (v.arguments?.game ?? []).flatMap((a) =>
    typeof a === 'string' ? [a] : typeof a.value === 'string' ? [a.value] : a.value,
  )
  return [...modern, ...(v.minecraftArguments?.split(/\s+/) ?? [])]
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

/** Reads `<mcRoot>/versions/<id>/<id>.json` and works out game version + loader. */
export async function readVersion(mcRoot: string, id: string): Promise<VersionInfo | undefined> {
  const file = path.join(mcRoot, 'versions', id, `${id}.json`)
  const parsed = VersionJson.safeParse(await readJson(file))
  if (!parsed.success) return undefined
  const v = parsed.data
  const args = gameArgs(v)

  let loader: Loader = 'vanilla'
  let loaderVersion: string | undefined
  for (const lib of v.libraries ?? []) {
    const hit = LIBRARY_LOADERS.find(([re]) => re.test(lib.name))
    if (hit) {
      loader = hit[1]
      loaderVersion = hit[0].exec(lib.name)?.[1]
      break
    }
  }
  const neo = argValue(args, '--fml.neoForgeVersion')
  const forge = argValue(args, '--fml.forgeVersion')
  if (neo) {
    loader = 'neoforge'
    loaderVersion = neo
  } else if (forge && loader === 'vanilla') {
    loader = 'forge'
    loaderVersion = forge
  }

  const gameVersion =
    argValue(args, '--fml.mcVersion') ??
    v.inheritsFrom ??
    v.jar ??
    (loader === 'vanilla' ? v.id : undefined)
  if (!gameVersion) return undefined
  return { id, file, gameVersion, loader, loaderVersion }
}

const LauncherProfiles = z.looseObject({
  profiles: z.record(
    z.string(),
    z.looseObject({
      name: z.string().optional(),
      gameDir: z.string().optional(),
      lastVersionId: z.string().optional(),
      lastUsed: z.string().optional(),
    }),
  ),
})

const SPECIAL_VERSION_IDS = new Set(['latest-release', 'latest-snapshot'])

function toFinding(v: VersionInfo, source: string, confidence: Finding['confidence']): Finding {
  return {
    source,
    confidence,
    detail: v.file,
    gameVersion: v.gameVersion,
    loader: v.loader,
    loaderVersion: v.loaderVersion,
  }
}

function toSuggestion(v: VersionInfo): Suggestion {
  return {
    label: v.id,
    gameVersion: v.gameVersion,
    loader: v.loader,
    loaderVersion: v.loaderVersion ?? null,
  }
}

async function moddedVersions(mcRoot: string): Promise<VersionInfo[]> {
  const ids = await list(path.join(mcRoot, 'versions'))
  const infos = await Promise.all(ids.map((id) => readVersion(mcRoot, id)))
  return infos.filter((v): v is VersionInfo => v !== undefined && v.loader !== 'vanilla')
}

export async function detectVersionJson(layout: Layout): Promise<Finding[]> {
  const { root } = layout

  // 1. Started inside .minecraft/versions/<id>.
  if (layout.versionId) {
    const v = await readVersion(root, layout.versionId)
    return v ? [toFinding(v, `Version folder (versions/${v.id})`, 'high')] : []
  }

  // 2. TLauncher "separate directories": game dir .minecraft/home/<id> ↔ .minecraft/versions/<id>.
  const parent = path.dirname(root)
  if (path.basename(parent) === 'home') {
    const v = await readVersion(path.dirname(parent), path.basename(root))
    if (v) return [toFinding(v, `TLauncher version (versions/${v.id})`, 'high')]
  }

  // 3. A launcher_profiles.json here or up to four levels above whose profile uses this game dir.
  let dir = root
  for (let depth = 0; depth <= 4; depth++) {
    const file = path.join(dir, 'launcher_profiles.json')
    const parsed = LauncherProfiles.safeParse(await readJson(file))
    if (parsed.success) return fromProfiles(dir, root, parsed.data)
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  return []
}

/** Profiles whose game dir is `root` (a profile without `gameDir` uses the .minecraft folder). */
async function fromProfiles(
  mcRoot: string,
  root: string,
  data: z.infer<typeof LauncherProfiles>,
): Promise<Finding[]> {
  const matching = Object.values(data.profiles)
    .filter((p) => samePath(path.resolve(mcRoot, p.gameDir ?? '.'), root))
    .filter((p) => p.lastVersionId && !SPECIAL_VERSION_IDS.has(p.lastVersionId))
    .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''))

  const seen = new Set<string>()
  const versions: VersionInfo[] = []
  for (const p of matching) {
    const id = p.lastVersionId ?? ''
    if (seen.has(id)) continue
    seen.add(id)
    const v = await readVersion(mcRoot, id)
    if (v) versions.push(v)
  }

  const isMcRoot = samePath(root, mcRoot)
  const suggestions = isMcRoot ? await moddedVersions(mcRoot) : versions
  const [latest] = versions
  if (!latest) {
    if (suggestions.length === 0) return []
    return [
      {
        source: 'Versions in .minecraft/versions',
        confidence: 'low',
        detail: path.join(mcRoot, 'versions'),
        suggestions: suggestions.map(toSuggestion),
      },
    ]
  }

  const own = !isMcRoot && versions.length === 1
  const finding = toFinding(
    latest,
    `Launcher profile (launcher_profiles.json → ${latest.id})`,
    own ? 'high' : 'medium',
  )
  if (suggestions.length > 1) {
    finding.suggestions = suggestions.map(toSuggestion)
    finding.warnings = [
      'Several versions use this game directory. Using the most recently played one; change it if needed.',
    ]
  }
  return [finding]
}
