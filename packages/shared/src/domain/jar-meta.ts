import { z } from 'zod'
import { Loader } from './loader'
import { Side } from './side'

/** What a jar says about itself (fabric.mod.json, mods.toml, plugin.yml, …). */
export const JarMeta = z.strictObject({
  id: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  authors: z.array(z.string()),
  /** Every loader the jar has metadata for; multi-loader jars list several. */
  loaders: z.array(Loader),
  side: Side,
  /** Required dependency ids (mod ids / plugin names), without minecraft and the loader itself. */
  depends: z.array(z.string()),
  homepage: z.string().optional(),
})
export type JarMeta = z.infer<typeof JarMeta>

const VersionBound = z.strictObject({ v: z.string(), inclusive: z.boolean() })

/** One interval of game versions; a missing bound is open. */
export const VersionInterval = z.strictObject({
  min: VersionBound.optional(),
  max: VersionBound.optional(),
})
export type VersionInterval = z.infer<typeof VersionInterval>

/** Game versions a jar declares support for: a union (OR) of intervals. */
export const VersionRange = z.strictObject({
  intervals: z.array(VersionInterval),
  /** Versions named in the range that could be "the" game version (inclusive bounds, exact pins). */
  candidates: z.array(z.string()),
})
export type VersionRange = z.infer<typeof VersionRange>
