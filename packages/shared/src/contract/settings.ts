import { z } from 'zod'
import { CurseForgeKey, ExportDirName } from '../domain/config'
import { Provider } from '../domain/mod'
import { defineEndpoint } from './define'

/** Where the CurseForge key comes from. The `CURSEFORGE_API_KEY` env var wins over a saved key. */
export const KeySource = z.enum(['config', 'env'])
export type KeySource = z.infer<typeof KeySource>

/** The global settings, as the UI sees them. The CurseForge key itself never leaves the backend. */
export const Settings = z.strictObject({
  curseforgeKeySet: z.boolean(),
  curseforgeKeySource: KeySource.nullable(),
  preferredProvider: Provider,
  allowPrerelease: z.boolean(),
  exportDirName: ExportDirName,
  /** The config file, so the user can find it. */
  configPath: z.string(),
})
export type Settings = z.infer<typeof Settings>

export const get = defineEndpoint({
  method: 'GET',
  path: '/api/settings',
  response: Settings,
})

export const SettingsBody = z.strictObject({
  /** Write-only. null removes the saved key. */
  curseforgeApiKey: CurseForgeKey.nullable().optional(),
  preferredProvider: Provider.optional(),
  allowPrerelease: z.boolean().optional(),
  exportDirName: ExportDirName.optional(),
})
export type SettingsBody = z.infer<typeof SettingsBody>

/** Changes the given settings (omitted ones stay) and saves them to the global config. */
export const update = defineEndpoint({
  method: 'PUT',
  path: '/api/settings',
  body: SettingsBody,
  response: Settings,
})

export const TestKeyResponse = z.strictObject({ ok: z.boolean(), message: z.string() })
export type TestKeyResponse = z.infer<typeof TestKeyResponse>

/** Checks a CurseForge key with a cheap request: the given one, or the one in use. */
export const testCurseforge = defineEndpoint({
  method: 'POST',
  path: '/api/settings/test-curseforge',
  body: z.strictObject({ apiKey: CurseForgeKey.optional() }),
  response: TestKeyResponse,
})
