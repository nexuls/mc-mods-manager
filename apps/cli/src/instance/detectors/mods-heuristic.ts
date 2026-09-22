import path from 'node:path'
import type { ContentKind, Loader } from '@mc-mod/shared'
import { readJarFile } from '../../jar/read-metadata'
import { bestCommonVersion, type VersionRange } from '../../lib/mc-version'
import { list } from './fs'
import type { Finding } from './types'

const MOD_LOADERS: Loader[] = ['neoforge', 'forge', 'fabric', 'quilt']
/** Reading every jar costs I/O; a few hundred is plenty for a majority vote. */
const MAX_JARS = 400

/** Plugin jars list the whole Bukkit family; Paper stands in for it. */
function pluginLoader(loaders: Loader[]): Loader | undefined {
  if (loaders.includes('velocity')) return 'velocity'
  if (loaders.includes('bungeecord')) return 'bungeecord'
  if (loaders.includes('paper') || loaders.includes('bukkit')) return 'paper'
  return undefined
}

/**
 * Low-confidence guess from the jars themselves: the loader most jars are built for, and the game
 * version most of those jars accept.
 */
export async function detectFromJars(contentDir: string, kind: ContentKind): Promise<Finding[]> {
  const jars = (await list(contentDir)).filter((f) => f.endsWith('.jar')).slice(0, MAX_JARS)
  if (jars.length === 0) return []

  const infos = await Promise.all(jars.map((f) => readJarFile(path.join(contentDir, f))))
  const votes = new Map<Loader, number>()
  const rangesByLoader = new Map<Loader, VersionRange[]>()
  for (const info of infos) {
    if (!info) continue
    const loaders =
      kind === 'mod'
        ? info.meta.loaders.filter((l) => MOD_LOADERS.includes(l))
        : [pluginLoader(info.meta.loaders)].filter((l) => l !== undefined)
    for (const l of loaders) {
      votes.set(l, (votes.get(l) ?? 0) + 1)
      if (info.minecraft) rangesByLoader.set(l, [...(rangesByLoader.get(l) ?? []), info.minecraft])
    }
  }

  const [loader] = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
  if (!loader) return []
  const best = bestCommonVersion(rangesByLoader.get(loader) ?? [])
  const warnings = ['Version and loader were guessed from the installed jars. Please confirm them.']
  if (best && best.matched < best.total) {
    const off = best.total - best.matched
    warnings.push(
      `${off} of ${best.total} jars don't declare support for Minecraft ${best.version}. They may be for another version.`,
    )
  }
  return [
    {
      source: `Installed jars (${jars.length} in ${path.basename(contentDir)}/)`,
      confidence: 'low',
      detail: contentDir,
      gameVersion: best?.version,
      loader,
      warnings,
    },
  ]
}
