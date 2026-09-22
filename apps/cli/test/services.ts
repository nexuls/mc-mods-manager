import { CatalogService } from '../src/services/catalog'
import { InstallerService } from '../src/services/installer'
import type { InstanceService } from '../src/services/instance'
import { LibraryService } from '../src/services/library'
import type { FakeModrinth } from './fake-modrinth'

/** Every service `createApp` needs, backed by one fake Modrinth. */
export function makeServices(
  instance: InstanceService,
  modrinth: FakeModrinth,
  now: () => number = Date.now,
) {
  const library = new LibraryService(instance, modrinth, now)
  const catalog = new CatalogService(instance, modrinth)
  return { instance, library, catalog, installer: new InstallerService(library, catalog, modrinth) }
}
