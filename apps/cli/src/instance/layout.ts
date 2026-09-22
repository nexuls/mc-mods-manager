import path from 'node:path'
import { exists } from './detectors/fs'
import type { Layout } from './detectors/types'

const CONTENT_DIRS = new Set(['mods', 'plugins'])
const PRISM_GAME_DIRS = ['.minecraft', 'minecraft']

async function isPrismInstance(dir: string): Promise<boolean> {
  return (
    (await exists(path.join(dir, 'mmc-pack.json'))) ||
    (await exists(path.join(dir, 'instance.cfg')))
  )
}

/**
 * Works out the instance root and game dir from where mc-mod was started:
 * - a `mods/`/`plugins/` folder → its parent
 * - a Prism/MultiMC game dir (`.minecraft`/`minecraft`) → the instance folder above it
 * - `.minecraft/versions/<id>` → `.minecraft` (mods/ there is shared by all versions)
 */
export async function resolveLayout(start: string): Promise<Layout> {
  let dir = path.resolve(start)
  let contentDirHint: string | undefined
  const warnings: string[] = []

  if (CONTENT_DIRS.has(path.basename(dir))) {
    contentDirHint = dir
    dir = path.dirname(dir)
  }

  if (PRISM_GAME_DIRS.includes(path.basename(dir)) && (await isPrismInstance(path.dirname(dir)))) {
    return { root: path.dirname(dir), gameDir: dir, contentDirHint, warnings }
  }

  if (await isPrismInstance(dir)) {
    let gameDir = path.join(dir, 'minecraft')
    for (const name of PRISM_GAME_DIRS) {
      if (await exists(path.join(dir, name))) {
        gameDir = path.join(dir, name)
        break
      }
    }
    return { root: dir, gameDir, contentDirHint, warnings }
  }

  const id = path.basename(dir)
  const parent = path.dirname(dir)
  if (path.basename(parent) === 'versions' && (await exists(path.join(dir, `${id}.json`)))) {
    const mcRoot = path.dirname(parent)
    warnings.push(
      `Started inside versions/${id}. Mods go to ${path.join(mcRoot, 'mods')}, which every version using this game directory shares.`,
    )
    return { root: mcRoot, gameDir: mcRoot, contentDirHint, versionId: id, warnings }
  }

  return { root: dir, gameDir: dir, contentDirHint, warnings }
}
