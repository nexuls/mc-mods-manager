import path from 'node:path'
import { CurseForgeKey } from '@mc-mod/shared'
import { z } from 'zod'

const Env = z.object({
  /** Enables dev-only behavior (e.g. token bypass behind the Vite proxy). */
  MC_MOD_DEV: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  /** Instance directory to manage instead of the current working directory. */
  MC_MOD_DIR: z.string().trim().min(1).optional(),
  /** CurseForge API key; wins over the one saved in Settings. Blank counts as unset. */
  CURSEFORGE_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .pipe(CurseForgeKey.optional()),
})

export type Env = z.infer<typeof Env>

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return Env.parse(source)
}

/**
 * True in the published bundle: `bun build` defines NODE_ENV as "production" there.
 * Dev mode is never available in the bundle, whatever the environment says.
 */
export const IS_BUNDLE = process.env.NODE_ENV === 'production'

/** Resolves the directory `mc-mod` manages: `--dir`, then MC_MOD_DIR, then the current directory. */
export function resolveTargetDir(
  sources: { dir?: string; env: Env },
  cwd: string = process.cwd(),
): string {
  return path.resolve(cwd, sources.dir ?? sources.env.MC_MOD_DIR ?? '.')
}
