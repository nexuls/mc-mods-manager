import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { ServerExportService } from '../services/server-export'
import { route } from './adapter'

export function exportRoutes(router: Router, deps: { serverExport: ServerExportService }): void {
  route(router, api.export.preview, async ({ query }) => deps.serverExport.preview(query.dirName))
  route(router, api.export.run, async ({ body }) => deps.serverExport.export(body))
  route(router, api.export.reveal, async ({ body }) =>
    deps.serverExport.reveal(body.mode, body.dirName),
  )
}
