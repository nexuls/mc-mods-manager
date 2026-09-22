import type { JarMeta } from '@mc-mod/shared'
import { unzipSync } from 'fflate'
import type { VersionRange } from '../lib/mc-version'
import { parseFabric } from './formats/fabric'
import { parseMcmodInfo } from './formats/mcmod-info'
import { parseModsToml } from './formats/mods-toml'
import {
  parseBungeeYml,
  parsePaperPluginYml,
  parsePluginYml,
  parseVelocityPluginJson,
} from './formats/plugins'
import { parseQuilt } from './formats/quilt'
import type { FormatContext, FormatResult } from './formats/types'
import { parseManifest } from './manifest'

const MANIFEST = 'META-INF/MANIFEST.MF'

/** Metadata entries, most specific first: the first one that parses supplies id/name/version. */
const FORMATS: [entry: string, parse: (text: string, ctx: FormatContext) => FormatResult | null][] =
  [
    ['quilt.mod.json', parseQuilt],
    ['fabric.mod.json', parseFabric],
    ['META-INF/neoforge.mods.toml', (t, c) => parseModsToml(t, c, 'neoforge.mods.toml')],
    ['META-INF/mods.toml', (t, c) => parseModsToml(t, c, 'mods.toml')],
    ['mcmod.info', parseMcmodInfo],
    ['paper-plugin.yml', parsePaperPluginYml],
    ['plugin.yml', parsePluginYml],
    ['bungee.yml', parseBungeeYml],
    ['velocity-plugin.json', parseVelocityPluginJson],
  ]

const WANTED = new Set([MANIFEST, ...FORMATS.map(([entry]) => entry)])

export interface JarInfo {
  meta: JarMeta
  /** Declared game version support, from the first format that has one. */
  minecraft: VersionRange | null
}

/**
 * Reads the metadata entries of a jar (zip) in memory. Returns null if the bytes aren't a readable zip.
 * A jar without any known metadata file gets empty `loaders`.
 */
export function readJarMetadata(bytes: Uint8Array): JarInfo | null {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (f) => WANTED.has(f.name) })
  } catch {
    return null
  }
  const decoder = new TextDecoder()
  const text = (name: string) => {
    const data = files[name]
    return data ? decoder.decode(data) : undefined
  }

  const manifestText = text(MANIFEST)
  const ctx: FormatContext = { manifest: manifestText ? parseManifest(manifestText) : new Map() }

  const results: FormatResult[] = []
  for (const [entry, parse] of FORMATS) {
    const t = text(entry)
    const r = t === undefined ? null : parse(t, ctx)
    if (r) results.push(r)
  }

  const [primary] = results
  if (!primary) {
    return {
      meta: { authors: [], loaders: [], side: 'unknown', depends: [] },
      minecraft: null,
    }
  }
  return {
    meta: {
      id: primary.id,
      name: primary.name,
      version: primary.version,
      authors: primary.authors,
      loaders: [...new Set(results.flatMap((r) => r.loaders))],
      side: results.find((r) => r.side !== 'unknown')?.side ?? 'unknown',
      depends: primary.depends,
      homepage: primary.homepage,
    },
    minecraft: results.find((r) => r.minecraft)?.minecraft ?? null,
  }
}

export async function readJarFile(path: string): Promise<JarInfo | null> {
  return readJarMetadata(await Bun.file(path).bytes())
}
