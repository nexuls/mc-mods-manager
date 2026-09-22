import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { LibraryService } from '../services/library'
import type { UpdatesService } from '../services/updates'
import { route } from './adapter'

export function modsRoutes(
  router: Router,
  deps: { library: LibraryService; updates: UpdatesService },
): void {
  route(router, api.mods.list, async () => deps.library.list())
  route(router, api.mods.refresh, async () => deps.library.list({ refresh: true }))
  route(router, api.mods.update, async ({ params, body }) =>
    deps.library.update(params.fileName, body),
  )
  route(router, api.mods.remove, async ({ params }) => deps.library.remove(params.fileName))
  route(router, api.mods.checkUpdates, async () => deps.updates.check())
  route(router, api.mods.updateOne, async ({ params, body }) =>
    deps.updates.updateOne(params.fileName, body.versionId),
  )
  route(router, api.mods.updateAll, async ({ body }) => deps.updates.updateAll(body.fileNames))
  route(router, api.mods.suggestions, async ({ params }) => ({
    suggestions: await deps.library.suggestions(params.fileName),
  }))
}
