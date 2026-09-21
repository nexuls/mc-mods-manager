import path from 'node:path'
import { z } from 'zod'

const Env = z.object({
  /** Enables dev-only behavior (e.g. token bypass behind the Vite proxy). */
  MC_MOD_DEV: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  /** Instance directory to manage instead of the current working directory. */
  MC_MOD_DIR: z.string().trim().min(1).optional(),
})

export type Env = z.infer<typeof Env>

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return Env.parse(source)
}

/** Resolves the directory `mc-mod` manages: MC_MOD_DIR if set, otherwise the current directory. */
export function resolveTargetDir(env: Env, cwd: string = process.cwd()): string {
  return path.resolve(cwd, env.MC_MOD_DIR ?? '.')
}
