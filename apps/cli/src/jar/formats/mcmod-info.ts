import { z } from 'zod'
import { parseMavenRange } from '../../lib/mc-version'
import { parseLenientJson } from './json'
import type { FormatParser } from './types'

const Entry = z.looseObject({
  modid: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  mcversion: z.string().optional(),
  authorList: z.array(z.string()).optional(),
  authors: z.array(z.string()).optional(),
  url: z.string().optional(),
  requiredMods: z.array(z.string()).optional(),
})

// Legacy Forge (≤ 1.12): a JSON array, or `{ modListVersion: 2, modList: [...] }`.
const McmodInfo = z.union([z.array(Entry), z.looseObject({ modList: z.array(Entry) })])

export const parseMcmodInfo: FormatParser = (text) => {
  const parsed = McmodInfo.safeParse(parseLenientJson(text))
  if (!parsed.success) return null
  const [mod] = Array.isArray(parsed.data) ? parsed.data : parsed.data.modList
  if (!mod) return null
  const mc = mod.mcversion && !mod.mcversion.includes('$') ? parseMavenRange(mod.mcversion) : null
  return {
    id: mod.modid,
    name: mod.name,
    version: mod.version?.includes('$') ? undefined : mod.version,
    authors: mod.authorList ?? mod.authors ?? [],
    loaders: ['forge'],
    side: 'unknown',
    depends: (mod.requiredMods ?? []).map((d) => d.split('@')[0] ?? d).filter((d) => d !== 'Forge'),
    homepage: mod.url || undefined,
    minecraft: mc,
  }
}
