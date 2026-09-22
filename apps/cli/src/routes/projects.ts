import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { CatalogService } from '../services/catalog'
import { route } from './adapter'

export function projectsRoutes(router: Router, deps: { catalog: CatalogService }): void {
  route(router, api.projects.search, async ({ query }) => deps.catalog.search(query))
  route(router, api.projects.project, async ({ params }) =>
    deps.catalog.project(params.provider, params.id),
  )
  route(router, api.projects.versions, async ({ params, query }) => ({
    versions: await deps.catalog.versions(params.provider, params.id, query.all),
  }))
  route(router, api.meta.gameVersions, async ({ query }) => ({
    versions: await deps.catalog.gameVersions(query.includeSnapshots),
  }))
  route(router, api.meta.categories, async ({ query }) => ({
    categories: await deps.catalog.categories(query.provider, query.kind),
  }))
}
