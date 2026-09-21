import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import { VERSION } from '../version'
import { route } from './adapter'

export function healthRoutes(router: Router, deps: { onHeartbeat: () => void }): void {
  route(router, api.health.get, async () => {
    deps.onHeartbeat()
    return { ok: true as const, version: VERSION }
  })
}
