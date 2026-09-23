import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { ShareService } from '../services/share'
import { route } from './adapter'

export function shareRoutes(router: Router, deps: { share: ShareService }): void {
  route(router, api.share.exportList, async () => deps.share.exportList())
  route(router, api.share.importPlan, async ({ body }) => deps.share.importPlan(body.list))
}
