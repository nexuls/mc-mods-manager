import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import {
  Config,
  defaultConfig,
  type KeySource,
  type Settings,
  type SettingsBody,
} from '@mc-mod/shared'
import envPaths from 'env-paths'
import { writeFileAtomic } from './instance/paths'

/** `~/.config/mc-mod/config.json`, `%APPDATA%\mc-mod\Config\config.json` or the macOS equivalent. */
export function defaultConfigFile(): string {
  return path.join(envPaths('mc-mod', { suffix: '' }).config, 'config.json')
}

/**
 * The global config (architecture §6): CurseForge key and preferences. Loaded once per run and kept in
 * memory; changes are written straight back. The file holds the API key, so it's only readable by the
 * user (0600).
 */
export class ConfigService {
  private pending: Promise<unknown> = Promise.resolve()

  constructor(
    readonly file: string,
    private current: Config = defaultConfig(),
    /** `CURSEFORGE_API_KEY`, which wins over the saved key. */
    private readonly envKey?: string,
    /** Set when the file couldn't be read and defaults are used. */
    readonly warning?: string,
  ) {}

  /**
   * Reads the config file. A missing file means defaults; an unreadable one is copied to
   * `config.json.broken` and replaced by defaults on the next save.
   */
  static async load(file: string, envKey?: string): Promise<ConfigService> {
    const f = Bun.file(file)
    if (!(await f.exists())) return new ConfigService(file, defaultConfig(), envKey)
    const raw: unknown = await f.json().catch(() => undefined)
    const parsed = Config.safeParse(raw)
    if (parsed.success) return new ConfigService(file, parsed.data, envKey)
    await copyFile(file, `${file}.broken`).catch(() => {})
    return new ConfigService(
      file,
      defaultConfig(),
      envKey,
      `Ignored ${file} (not a valid mc-mod config). A copy was saved as config.json.broken.`,
    )
  }

  get config(): Config {
    return this.current
  }

  /** The CurseForge key in use, if any. Never send it to the browser or log it. */
  curseforgeKey(): string | undefined {
    return this.envKey ?? this.current.curseforgeApiKey
  }

  settings(): Settings {
    const source: KeySource | null = this.envKey
      ? 'env'
      : this.current.curseforgeApiKey
        ? 'config'
        : null
    return {
      curseforgeKeySet: source !== null,
      curseforgeKeySource: source,
      preferredProvider: this.current.preferredProvider,
      allowPrerelease: this.current.allowPrerelease,
      exportDirName: this.current.exportDirName,
      configPath: this.file,
    }
  }

  /** Applies the given changes (omitted fields stay) and saves. Saves run one after another. */
  update(body: SettingsBody): Promise<Settings> {
    const run = this.pending
      .catch(() => {})
      .then(async () => {
        const next: Config = { ...this.current }
        if (body.curseforgeApiKey !== undefined) {
          next.curseforgeApiKey = body.curseforgeApiKey ?? undefined
        }
        if (body.preferredProvider !== undefined) next.preferredProvider = body.preferredProvider
        if (body.allowPrerelease !== undefined) next.allowPrerelease = body.allowPrerelease
        if (body.exportDirName !== undefined) next.exportDirName = body.exportDirName
        const text = `${JSON.stringify(Config.parse(next), null, 2)}\n`
        await writeFileAtomic(path.dirname(this.file), this.file, text, { mode: 0o600 })
        this.current = next
        return this.settings()
      })
    this.pending = run
    return run
  }
}
