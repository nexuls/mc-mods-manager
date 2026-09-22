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
