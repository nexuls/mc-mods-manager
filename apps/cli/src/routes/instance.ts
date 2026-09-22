import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { InstanceService } from '../services/instance'
import { route } from './adapter'

export function instanceRoutes(router: Router, deps: { instance: InstanceService }): void {
  route(router, api.instance.get, async () => deps.instance.response())
  route(router, api.instance.update, async ({ body }) => deps.instance.setOverrides(body))
}
