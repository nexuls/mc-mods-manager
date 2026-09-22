import { z } from 'zod'
import { Provider } from './mod'

/** A CurseForge API key from console.curseforge.com: printable, no spaces. */
export const CurseForgeKey = z
  .string()
  .trim()
  .min(1, 'Enter a key')
  .max(200)
  .regex(/^[\x21-\x7e]+$/, 'A key has no spaces or special characters')

/** Name of the server export folder, created in the instance root. A plain folder name. */
export const ExportDirName = z
  .string()
  .trim()
  .min(1, 'Enter a folder name')
  .max(100)
  .regex(/^[\w .-]+$/, 'Use letters, digits, spaces, dots, dashes or underscores')
  .refine((n) => !n.startsWith('.'), 'Must not start with a dot')

export const DEFAULT_EXPORT_DIR = 'server-mods'

/**
 * The global `config.json` (`~/.config/mc-mod/` or the OS equivalent). Loose so fields written by a
 * newer mc-mod survive; a bad value falls back to its default instead of failing the whole file.
 */
export const Config = z.looseObject({
  schemaVersion: z.literal(1),
  curseforgeApiKey: CurseForgeKey.optional().catch(undefined),
  /** Used for updates and "open page" when a jar is on both platforms. */
  preferredProvider: Provider.catch('modrinth'),
  /** Let betas and alphas be recommended when they're newer than the latest release. */
  allowPrerelease: z.boolean().catch(false),
  exportDirName: ExportDirName.catch(DEFAULT_EXPORT_DIR),
})
export type Config = z.infer<typeof Config>

export const defaultConfig = (): Config => Config.parse({ schemaVersion: 1 })
