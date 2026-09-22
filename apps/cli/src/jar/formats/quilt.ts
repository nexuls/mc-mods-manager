import { z } from 'zod'
import { parseFabricRange } from '../../lib/mc-version'
import { PLATFORM_IDS, parseLenientJson } from './json'
import type { FormatParser } from './types'

const Versions = z.union([z.string(), z.array(z.string())])
const Dependency = z.union([
  z.string(),
  z.looseObject({
    id: z.string(),
    versions: Versions.optional(),
    optional: z.boolean().optional(),
  }),
])

// https://github.com/QuiltMC/rfcs/blob/main/specification/0002-quilt.mod.json.md — only the fields we use.
const QuiltModJson = z.looseObject({
  quilt_loader: z.looseObject({
    id: z.string(),
    version: z.string().optional(),
    depends: z.array(Dependency).optional(),
    metadata: z
      .looseObject({
        name: z.string().optional(),
        contributors: z.record(z.string(), z.unknown()).optional(),
        contact: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
  minecraft: z
    .looseObject({ environment: z.enum(['*', 'client', 'dedicated_server']).optional() })
    .optional(),
})

export const parseQuilt: FormatParser = (text) => {
  const parsed = QuiltModJson.safeParse(parseLenientJson(text))
  if (!parsed.success) return null
  const { quilt_loader: q, minecraft } = parsed.data
  const deps = (q.depends ?? []).map((d) => (typeof d === 'string' ? { id: d } : d))
  const mc = deps.find((d) => d.id === 'minecraft')
  const env = minecraft?.environment
  const homepage = q.metadata?.contact?.homepage
  return {
    id: q.id,
    name: q.metadata?.name,
    version: q.version,
    authors: Object.keys(q.metadata?.contributors ?? {}),
    loaders: ['quilt'],
    side: env === 'client' ? 'client' : env === 'dedicated_server' ? 'server' : 'both',
    depends: deps
      .filter((d) => !('optional' in d && d.optional) && !PLATFORM_IDS.has(d.id))
      .map((d) => d.id),
    homepage: typeof homepage === 'string' ? homepage : undefined,
    minecraft: mc && 'versions' in mc && mc.versions ? parseFabricRange(mc.versions) : null,
  }
}
