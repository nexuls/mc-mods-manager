import { api } from '@mc-mod/shared'
import type { Router } from 'express'
import type { TrashService } from '../services/trash'
import { route } from './adapter'

export function trashRoutes(router: Router, deps: { trash: TrashService }): void {
  route(router, api.trash.list, async () => deps.trash.list())
  route(router, api.trash.restore, async ({ params }) => deps.trash.restore(params.id))
  route(router, api.trash.remove, async ({ params }) => deps.trash.remove(params.id))
  route(router, api.trash.empty, async () => deps.trash.empty())
}
