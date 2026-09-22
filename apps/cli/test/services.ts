import os from 'node:os'
import path from 'node:path'
import { ConfigService } from '../src/config'
import { CurseForgeProvider } from '../src/providers/curseforge'
import type { Fetch } from '../src/providers/types'
import { CatalogService } from '../src/services/catalog'
import { InstallerService } from '../src/services/installer'
import type { InstanceService } from '../src/services/instance'
import { JobService } from '../src/services/jobs'
import { LibraryService } from '../src/services/library'
import { ServerExportService } from '../src/services/server-export'
import { SettingsService } from '../src/services/settings'
import { UpdateStore, UpdatesService } from '../src/services/updates'
import type { FakeCurseForge } from './fake-curseforge'
import type { FakeModrinth } from './fake-modrinth'

export interface ServiceOptions {
  instance: InstanceService
  modrinth: FakeModrinth
  now?: () => number
  /** Downloads. */
  fetch?: Fetch
  /** Defaults to an unsaved default config in a temp path (written only when a test saves settings). */
  config?: ConfigService
  curseforge?: FakeCurseForge
  /** "Opens" folders for the export's reveal; records nothing and reports success by default. */
  openFolder?: (dir: string) => Promise<boolean>
}

/** Every service `createApp` needs, backed by fakes. */
export function makeServices(o: ServiceOptions) {
  const { instance, modrinth } = o
  const now = o.now ?? Date.now
  const config =
    o.config ??
    new ConfigService(path.join(os.tmpdir(), `mc-mod-test-${crypto.randomUUID()}`, 'config.json'))
  // Without a key every CurseForge call is PROVIDER_DISABLED, and nothing reaches the network.
  const curseforge =
    o.curseforge ??
    new CurseForgeProvider(
      () => config.curseforgeKey(),
      async () => new Response('{}', { status: 404 }),
    )
  const catalog = new CatalogService(instance, modrinth, curseforge, config)
  const store = new UpdateStore(() => catalog.versionContext())
  const library = new LibraryService({
    instance,
    modrinth,
    curseforge,
    config,
    updates: store,
    now,
  })
  const jobs = new JobService()
  const installer = new InstallerService({
    instance,
    library,
    catalog,
    modrinth,
    curseforge,
    jobs,
    fetch: o.fetch,
    now,
    // A throw here would leave the job without its `done` event; the item already reports INTERNAL.
    onInternalError: (err) => console.error(err),
  })
  const settings = new SettingsService(config, curseforge)
  const updates = new UpdatesService({ library, catalog, installer, curseforge, store })
  const serverExport = new ServerExportService({
    instance,
    library,
    config,
    openFolder: o.openFolder ?? (async () => true),
    now,
  })
  return {
    instance,
    library,
    catalog,
    jobs,
    installer,
    settings,
    updates,
    serverExport,
    config,
    curseforge,
  }
}
