import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'
import { parseMavenRange } from '../../lib/mc-version'
import { PLATFORM_IDS } from './json'
import type { FormatContext, FormatResult } from './types'

const Dependency = z.looseObject({
  modId: z.string(),
  mandatory: z.boolean().optional(), // Forge
  type: z.string().optional(), // NeoForge: required | optional | incompatible | discouraged
  versionRange: z.string().optional(),
  side: z.string().optional(),
})

// https://docs.neoforged.net/docs/gettingstarted/modfiles — only the fields we use.
const ModsToml = z.looseObject({
  mods: z
    .array(
      z.looseObject({
        modId: z.string(),
        version: z.string().optional(),
        displayName: z.string().optional(),
        authors: z.union([z.string(), z.array(z.string())]).optional(),
        displayURL: z.string().optional(),
        displayTest: z.string().optional(),
      }),
    )
    .min(1),
  dependencies: z.record(z.string(), z.array(Dependency)).optional(),
})

/**
 * `META-INF/mods.toml` (Forge; also NeoForge before 1.20.5) or `META-INF/neoforge.mods.toml`.
 * An old-style file is NeoForge when it depends on `neoforge`.
 */
export function parseModsToml(
  text: string,
  ctx: FormatContext,
  file: 'mods.toml' | 'neoforge.mods.toml',
): FormatResult | null {
  let raw: unknown
  try {
    raw = parseToml(text)
  } catch {
    return null
  }
  const parsed = ModsToml.safeParse(raw)
  if (!parsed.success) return null
  const [mod] = parsed.data.mods
  if (!mod) return null

  const deps = parsed.data.dependencies?.[mod.modId] ?? []
  const mc = deps.find((d) => d.modId === 'minecraft')
  const mcSide = mc?.side?.toUpperCase()
  const loader =
    file === 'neoforge.mods.toml' || deps.some((d) => d.modId === 'neoforge') ? 'neoforge' : 'forge'

  return {
    id: mod.modId,
    name: mod.displayName,
    version: resolvePlaceholder(mod.version, ctx),
    authors: splitAuthors(mod.authors),
    loaders: [loader],
    side:
      mcSide === 'CLIENT' || mod.displayTest === 'IGNORE_SERVER_VERSION'
        ? 'client'
        : mcSide === 'SERVER'
          ? 'server'
          : 'unknown',
    depends: deps
      .filter((d) => (d.mandatory ?? d.type === 'required') && !PLATFORM_IDS.has(d.modId))
      .map((d) => d.modId),
    homepage: mod.displayURL,
    minecraft: mc?.versionRange ? parseMavenRange(mc.versionRange) : null,
  }
}

function resolvePlaceholder(version: string | undefined, ctx: FormatContext): string | undefined {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Forge placeholder, not a template
  if (version !== '${file.jarVersion}') return version
  return ctx.manifest.get('Implementation-Version')
}

function splitAuthors(authors: string | string[] | undefined): string[] {
  if (authors === undefined) return []
  const list = typeof authors === 'string' ? authors.split(/,|\band\b/) : authors
  return list.map((a) => a.trim()).filter(Boolean)
}
