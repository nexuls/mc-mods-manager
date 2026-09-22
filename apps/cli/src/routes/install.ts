import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { InstallerService } from '../services/installer'
import { route } from './adapter'

export function installRoutes(router: Router, deps: { installer: InstallerService }): void {
  route(router, api.install.plan, async ({ body }) => deps.installer.plan(body))
}
