import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import { AppError } from '../errors'
import type { InstallerService } from '../services/installer'
import type { JobService } from '../services/jobs'
import { route, streamRoute } from './adapter'

export function installRoutes(
  router: Router,
  deps: { installer: InstallerService; jobs: JobService },
): void {
  route(router, api.install.plan, async ({ body }) => deps.installer.plan(body))
  route(router, api.install.install, async ({ body }) => deps.installer.install(body))
  streamRoute(router, api.jobs.events, async ({ params }, signal) => {
    const job = deps.jobs.get(params.id)
    if (!job) throw new AppError('NOT_FOUND', 'No such job (they are kept for 10 minutes)')
    return job.events(signal)
  })
}
