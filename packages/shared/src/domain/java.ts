import { z } from 'zod'

/** A Java major version as everyone writes it since Java 9: `8`, `17`, `21`. */
export const JavaMajor = z.number().int().min(6).max(99)

/**
 * Where a Java version comes from:
 * - `detected`: a launcher or version manifest says so
 * - `game-version`: what this Minecraft version needs (`javaForGameVersion`), nobody wrote it down
 */
export const JavaSource = z.enum(['detected', 'game-version'])
export type JavaSource = z.infer<typeof JavaSource>

export const JavaInfo = z.strictObject({ major: JavaMajor, source: JavaSource })
export type JavaInfo = z.infer<typeof JavaInfo>

/** Mojang's Java requirement per release, newest rule first. */
const JAVA_BY_VERSION: { minor: number; patch: number; major: number }[] = [
  { minor: 20, patch: 5, major: 21 },
  { minor: 18, patch: 0, major: 17 },
  { minor: 17, patch: 0, major: 16 },
]

/**
 * The Java version a Minecraft release needs (`1.21.1` → 21). Snapshots and anything that isn't a
 * `1.x[.y]` release give null: their requirement isn't derivable from the name.
 */
export function javaForGameVersion(gameVersion: string): number | null {
  const m = /^1\.(\d+)(?:\.(\d+))?$/.exec(gameVersion.trim())
  if (!m?.[1]) return null
  const minor = Number(m[1])
  const patch = Number(m[2] ?? 0)
  const rule = JAVA_BY_VERSION.find(
    (r) => minor > r.minor || (minor === r.minor && patch >= r.patch),
  )
  return rule?.major ?? 8
}
