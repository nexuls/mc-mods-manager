import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { parseLenientJson } from './json'
import type { FormatParser, FormatResult } from './types'

// Plugin metadata carries no game version worth trusting (api-version is only a minimum), so
// `minecraft` is always null here and plugins are always server-side.

const Str = z.union([z.string(), z.number()]).transform(String)
const StrList = z.union([z.array(Str), Str.transform((s) => [s])])

function yaml(text: string): unknown {
  try {
    return parseYaml(text)
  } catch {
    return undefined
  }
}

function plugin(r: Omit<FormatResult, 'side' | 'minecraft'>): FormatResult {
  return { ...r, side: 'server', minecraft: null }
}

// https://docs.papermc.io/paper/dev/plugin-yml
const PluginYml = z.looseObject({
  name: Str,
  version: Str.optional(),
  author: Str.optional(),
  authors: StrList.optional(),
  depend: StrList.optional(),
  website: Str.optional(),
  'folia-supported': z.boolean().optional(),
})

/** `plugin.yml`: Bukkit API, so it runs on Bukkit and everything built on it. */
export const parsePluginYml: FormatParser = (text) => {
  const parsed = PluginYml.safeParse(yaml(text))
  if (!parsed.success) return null
  const p = parsed.data
  return plugin({
    id: p.name,
    name: p.name,
    version: p.version,
    authors: [...(p.author ? [p.author] : []), ...(p.authors ?? [])],
    loaders: [
      'bukkit',
      'spigot',
      'paper',
      'purpur',
      ...(p['folia-supported'] ? (['folia'] as const) : []),
    ],
    depends: p.depend ?? [],
    homepage: p.website,
  })
}

// https://docs.papermc.io/paper/dev/getting-started/paper-plugins
const PaperPluginYml = z.looseObject({
  name: Str,
  version: Str.optional(),
  authors: StrList.optional(),
  website: Str.optional(),
  'folia-supported': z.boolean().optional(),
  dependencies: z
    .looseObject({
      server: z
        .record(z.string(), z.looseObject({ required: z.boolean().optional() }).nullable())
        .optional(),
    })
    .optional(),
})

export const parsePaperPluginYml: FormatParser = (text) => {
  const parsed = PaperPluginYml.safeParse(yaml(text))
  if (!parsed.success) return null
  const p = parsed.data
  return plugin({
    id: p.name,
    name: p.name,
    version: p.version,
    authors: p.authors ?? [],
    loaders: ['paper', 'purpur', ...(p['folia-supported'] ? (['folia'] as const) : [])],
    depends: Object.entries(p.dependencies?.server ?? {})
      .filter(([, d]) => d?.required ?? true)
      .map(([name]) => name),
    homepage: p.website,
  })
}

const BungeeYml = z.looseObject({
  name: Str,
  version: Str.optional(),
  author: Str.optional(),
  depends: StrList.optional(),
})

export const parseBungeeYml: FormatParser = (text) => {
  const parsed = BungeeYml.safeParse(yaml(text))
  if (!parsed.success) return null
  const p = parsed.data
  return plugin({
    id: p.name,
    name: p.name,
    version: p.version,
    authors: p.author ? [p.author] : [],
    loaders: ['bungeecord', 'waterfall'],
    depends: p.depends ?? [],
    homepage: undefined,
  })
}

// https://docs.papermc.io/velocity/dev/plugin-metadata (written by the annotation processor)
const VelocityPluginJson = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  url: z.string().optional(),
  authors: z.array(z.string()).optional(),
  dependencies: z
    .array(z.looseObject({ id: z.string(), optional: z.boolean().optional() }))
    .optional(),
})

export const parseVelocityPluginJson: FormatParser = (text) => {
  const parsed = VelocityPluginJson.safeParse(parseLenientJson(text))
  if (!parsed.success) return null
  const p = parsed.data
  return plugin({
    id: p.id,
    name: p.name,
    version: p.version,
    authors: p.authors ?? [],
    loaders: ['velocity'],
    depends: (p.dependencies ?? []).filter((d) => !d.optional).map((d) => d.id),
    homepage: p.url,
  })
}
