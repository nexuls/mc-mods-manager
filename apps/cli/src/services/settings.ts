import type { Settings, SettingsBody, TestKeyResponse } from '@mc-mod/shared'
import type { ConfigService } from '../config'
import type { CurseForgeProvider } from '../providers/curseforge'

/** Global settings: reading and saving the config, and checking a CurseForge key. */
export class SettingsService {
  constructor(
    private readonly config: ConfigService,
    private readonly curseforge: Pick<CurseForgeProvider, 'testKey'>,
  ) {}

  get(): Settings {
    return this.config.settings()
  }

  update(body: SettingsBody): Promise<Settings> {
    return this.config.update(body)
  }

  /** Tests `apiKey`, or the key in use when it's left out. */
  async testCurseforge(apiKey: string | undefined): Promise<TestKeyResponse> {
    const key = apiKey ?? this.config.curseforgeKey()
    if (!key) return { ok: false, message: 'No API key is set.' }
    return this.curseforge.testKey(key)
  }
}
