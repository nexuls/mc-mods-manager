import { z } from 'zod'
import { parseFabricRange } from '../../lib/mc-version'
import { PLATFORM_IDS, parseLenientJson } from './json'
import type { FormatParser } from './types'

const Person = z.union([z.string(), z.looseObject({ name: z.string() })])
const Predicate = z.union([z.string(), z.array(z.string())])

// https://wiki.fabricmc.net/documentation:fabric_mod_json_spec — only the fields we use.
const FabricModJson = z.looseObject({
  id: z.string(),
  version: z.string().optional(),
  name: z.string().optional(),
  authors: z.array(Person).optional(),
  environment: z.enum(['*', 'client', 'server']).optional(),
  depends: z.record(z.string(), Predicate).optional(),
  contact: z
    .looseObject({ homepage: z.string().optional(), sources: z.string().optional() })
    .optional(),
})

export const parseFabric: FormatParser = (text) => {
  const parsed = FabricModJson.safeParse(parseLenientJson(text))
  if (!parsed.success) return null
  const m = parsed.data
  const depends = m.depends ?? {}
  const mc = depends.minecraft
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    authors: (m.authors ?? []).map((a) => (typeof a === 'string' ? a : a.name)),
    loaders: ['fabric'],
    side: m.environment === 'client' ? 'client' : m.environment === 'server' ? 'server' : 'both',
    depends: Object.keys(depends).filter((id) => !PLATFORM_IDS.has(id)),
    homepage: m.contact?.homepage ?? m.contact?.sources,
    minecraft: mc === undefined ? null : parseFabricRange(mc),
  }
}
