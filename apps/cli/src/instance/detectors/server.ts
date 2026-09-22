import path from 'node:path'
import type { Loader } from '@mc-mod/shared'
import { z } from 'zod'
import { compareVersions, isReleaseVersion } from '../../lib/mc-version'
import { exists, findSubdir, list, readJson, readText } from './fs'
import type { Finding, Layout } from './types'

const VERSION_DIR = /^\d+\.\d+(\.\d+)?$/

/** `libraries/<group path>/<artifact>/<version>/` → the newest version folder. */
async function libraryVersion(root: string, ...group: string[]): Promise<string | undefined> {
  return findSubdir(path.join(root, 'libraries', ...group), /\S/, compareVersions)
}

/** Server jar names like `paper-1.21.4-123.jar` or `purpur-1.21.4-2380.jar`. */
const JAR_NAME =
  /^(paper|purpur|folia|spigot|craftbukkit|velocity|waterfall|bungeecord)-(\d+\.\d+(?:\.\d+)?)/i

const VersionHistory = z.looseObject({ currentVersion: z.string() })

async function gameVersionOf(root: string, jars: string[]): Promise<string | undefined> {
  // Paper: version_history.json → "git-Paper-123 (MC: 1.21.4)" or "1.21.4-123-abc (MC: 1.21.4)".
  const history = VersionHistory.safeParse(await readJson(path.join(root, 'version_history.json')))
  const fromHistory = history.success
    ? /\(MC: ([^)]+)\)/.exec(history.data.currentVersion)?.[1]
    : undefined
  if (fromHistory) return fromHistory

  // Forge/NeoForge installers: libraries/net/minecraft/server/<mc>-<mcp>/.
  const mcServer = await libraryVersion(root, 'net', 'minecraft', 'server')
  const fromLibs = mcServer?.split('-')[0]
  if (fromLibs && isReleaseVersion(fromLibs)) return fromLibs

  // The vanilla bundler (also inside Paper) extracts to versions/<mc>/.
  const fromVersions = await findSubdir(path.join(root, 'versions'), VERSION_DIR, compareVersions)
  if (fromVersions) return fromVersions

  // Fabric's launcher caches the vanilla jar as .fabric/server/<…>-<mc>-server.jar or similar.
  for (const f of await list(path.join(root, '.fabric', 'server'))) {
    const m = /(\d+\.\d+(?:\.\d+)?)/.exec(f)
    if (m?.[1]) return m[1]
  }

  for (const jar of jars) {
    const m = JAR_NAME.exec(jar)
    if (m?.[2]) return m[2]
  }
  return undefined
}

async function modLoaderOf(
  root: string,
  jars: string[],
): Promise<{ loader: Loader; version?: string } | undefined> {
  const neoforge = await libraryVersion(root, 'net', 'neoforged', 'neoforge')
  if (neoforge) return { loader: 'neoforge', version: neoforge }
  const forge = await libraryVersion(root, 'net', 'minecraftforge', 'forge')
  if (forge) return { loader: 'forge', version: forge.split('-').slice(1).join('-') || forge }
  const quilt = await libraryVersion(root, 'org', 'quiltmc', 'quilt-loader')
  if (quilt || jars.includes('quilt-server-launch.jar')) return { loader: 'quilt', version: quilt }
  const fabric = await libraryVersion(root, 'net', 'fabricmc', 'fabric-loader')
  if (
    fabric ||
    jars.includes('fabric-server-launch.jar') ||
    (await exists(path.join(root, '.fabric'))) ||
    (await exists(path.join(root, 'fabric-server-launcher.properties')))
  ) {
    return { loader: 'fabric', version: fabric }
  }
  return undefined
}

async function pluginLoaderOf(root: string, jars: string[]): Promise<Loader | undefined> {
  const has = (f: string) => exists(path.join(root, f))
  const jarLoader = jars.map((j) => JAR_NAME.exec(j)?.[1]?.toLowerCase()).find(Boolean)
  if (jarLoader === 'folia') return 'folia'
  if (await has('purpur.yml')) return 'purpur'
  if ((await has('config/paper-global.yml')) || (await has('paper.yml'))) return 'paper'
  if (await has('spigot.yml')) return 'spigot'
  if (await has('bukkit.yml')) return 'bukkit'
  return undefined
}

async function proxyOf(root: string): Promise<Loader | undefined> {
  if (await exists(path.join(root, 'velocity.toml'))) return 'velocity'
  if (await exists(path.join(root, 'waterfall.yml'))) return 'waterfall'
  const config = await readText(path.join(root, 'config.yml'))
  if (config && /^listeners:/m.test(config)) return 'bungeecord'
  return undefined
}

/** Dedicated servers and proxies, recognised by the files they create. */
export async function detectServer({ root }: Layout): Promise<Finding[]> {
  const isServer =
    (await exists(path.join(root, 'server.properties'))) ||
    (await exists(path.join(root, 'eula.txt')))
  const proxy = await proxyOf(root)
  if (!isServer && !proxy) return []

  const jars = (await list(root)).filter((f) => f.endsWith('.jar'))
  const base: Finding = {
    source: proxy ? 'Proxy files' : 'Server files (server.properties)',
    confidence: 'high',
    detail: root,
    kind: 'server',
  }
  if (proxy) return [{ ...base, loader: proxy }]

  const mod = await modLoaderOf(root, jars)
  const plugin = mod ? undefined : await pluginLoaderOf(root, jars)
  return [
    {
      ...base,
      gameVersion: await gameVersionOf(root, jars),
      loader: mod?.loader ?? plugin,
      loaderVersion: mod?.version,
    },
  ]
}
