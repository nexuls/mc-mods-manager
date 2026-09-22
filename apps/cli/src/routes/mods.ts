import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { LibraryService } from '../services/library'
import { route } from './adapter'

export function modsRoutes(router: Router, deps: { library: LibraryService }): void {
  route(router, api.mods.list, async () => deps.library.list())
  route(router, api.mods.refresh, async () => deps.library.list({ refresh: true }))
  route(router, api.mods.update, async ({ params, body }) =>
    deps.library.update(params.fileName, body),
  )
  route(router, api.mods.remove, async ({ params }) => deps.library.remove(params.fileName))
  route(router, api.mods.suggestions, async ({ params }) => ({
    suggestions: await deps.library.suggestions(params.fileName),
  }))
}
