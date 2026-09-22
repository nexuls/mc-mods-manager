import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { SettingsService } from '../services/settings'
import { route } from './adapter'

export function settingsRoutes(router: Router, deps: { settings: SettingsService }): void {
  route(router, api.settings.get, async () => deps.settings.get())
  route(router, api.settings.update, async ({ body }) => deps.settings.update(body))
  route(router, api.settings.testCurseforge, async ({ body }) =>
    deps.settings.testCurseforge(body.apiKey),
  )
}
