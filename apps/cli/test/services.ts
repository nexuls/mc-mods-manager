import type { Fetch } from '../src/providers/types'
import { CatalogService } from '../src/services/catalog'
import { InstallerService } from '../src/services/installer'
import type { InstanceService } from '../src/services/instance'
import { JobService } from '../src/services/jobs'
import { LibraryService } from '../src/services/library'
import type { FakeModrinth } from './fake-modrinth'

export interface ServiceOptions {
  instance: InstanceService
  modrinth: FakeModrinth
  now?: () => number
  /** Downloads. */
  fetch?: Fetch
}

/** Every service `createApp` needs, backed by fakes. */
export function makeServices(o: ServiceOptions) {
  const { instance, modrinth } = o
  const now = o.now ?? Date.now
  const library = new LibraryService(instance, modrinth, now)
  const catalog = new CatalogService(instance, modrinth)
  const jobs = new JobService()
  const installer = new InstallerService({
    instance,
    library,
    catalog,
    modrinth,
    jobs,
    fetch: o.fetch,
    now,
    // A throw here would leave the job without its `done` event; the item already reports INTERNAL.
    onInternalError: (err) => console.error(err),
  })
  return { instance, library, catalog, jobs, installer }
}
