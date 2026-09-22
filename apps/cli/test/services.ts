import { CatalogService } from '../src/services/catalog'
import type { InstanceService } from '../src/services/instance'
import { LibraryService } from '../src/services/library'
import type { FakeModrinth } from './fake-modrinth'

/** Every service `createApp` needs, backed by one fake Modrinth. */
export function makeServices(
  instance: InstanceService,
  modrinth: FakeModrinth,
  now: () => number = Date.now,
) {
  return {
    instance,
    library: new LibraryService(instance, modrinth, now),
    catalog: new CatalogService(instance, modrinth),
  }
}
