import { statSync } from 'node:fs'
import path from 'node:path'
import { TOKEN_PARAM } from '@mc-mod/shared'
import { ConfigService, defaultConfigFile } from '../config'
import { IS_BUNDLE, parseEnv, resolveTargetDir } from '../env'
import { CurseForgeProvider } from '../providers/curseforge'
import { ModrinthProvider } from '../providers/modrinth'
import { type Auth, createSessionToken } from '../security'
import { createApp, type WebAssets } from '../server'
import { BridgeStore } from '../services/bridges'
import { CatalogService } from '../services/catalog'
import { InstallerService } from '../services/installer'
import { InstanceService } from '../services/instance'
import { JobService } from '../services/jobs'
import { LibraryService } from '../services/library'
import { ServerExportService } from '../services/server-export'
import { SettingsService } from '../services/settings'
import { ShareService } from '../services/share'
import { TrashService } from '../services/trash'
import { UpdateStore, UpdatesService } from '../services/updates'
import { VERSION } from '../version'
import { openBrowser, openFolder } from './browser'
import { watchIdle } from './idle'
import { HOST, listen, PortInUseError } from './listen'
import { createProgram, DEFAULT_PORT, parseOptions } from './options'
import * as terminal from './terminal'

export interface RunOptions {
  /** The web UI files a standalone binary embeds (see `scripts/compile.ts`), by URL path. */
  embeddedWeb?: Readonly<Record<string, string>>
}

/** The `mc-mod` command: parse options, start the server, open the UI, stop on Ctrl+C. */
export async function run(argv: readonly string[], runOptions: RunOptions = {}): Promise<void> {
  const options = parseOptions(createProgram(), argv)
  const env = parseEnv()
  const dev = env.MC_MOD_DEV && !IS_BUNDLE

  terminal.banner(VERSION, dev)
  if (dev) terminal.devWarning()

  const dir = resolveTargetDir({ dir: options.dir, env })
  if (!isDirectory(dir)) {
    terminal.fatal(`Directory not found: ${dir}`, 'Pass an existing directory with --dir.')
    process.exit(1)
  }

  const spin = terminal.detecting()
  let instance: InstanceService
  try {
    instance = await InstanceService.load(dir)
  } catch (err) {
    spin.error('Could not read the instance')
    throw err
  }
  terminal.detected(spin, instance.response())

  const auth: Auth = dev ? { mode: 'dev' } : { mode: 'token', token: createSessionToken() }
  const idle = options.exitOnClose
    ? watchIdle({ onIdle: () => void shutdown('UI closed, server stopped.') })
    : undefined

  const config = await ConfigService.load(defaultConfigFile(), env.CURSEFORGE_API_KEY)
  if (config.warning) terminal.warning(config.warning)

  const modrinth = new ModrinthProvider()
  const curseforge = new CurseForgeProvider(() => config.curseforgeKey())
  const bridges = new BridgeStore()
  const catalog = new CatalogService(instance, modrinth, curseforge, config, bridges)
  const store = new UpdateStore(() => catalog.versionContext())
  const library = new LibraryService({
    instance,
    modrinth,
    curseforge,
    config,
    bridges,
    updates: store,
  })
  const jobs = new JobService()
  const installer = new InstallerService({
    instance,
    library,
    catalog,
    modrinth,
    curseforge,
    jobs,
    onInternalError: terminal.internalError,
  })
  const { app } = createApp({
    auth,
    services: {
      instance,
      library,
      catalog,
      jobs,
      settings: new SettingsService(config, curseforge),
      installer,
      updates: new UpdatesService({ library, catalog, installer, curseforge, store }),
      serverExport: new ServerExportService({ instance, library, config, openFolder }),
      share: new ShareService({ instance, library, catalog, curseforge, version: VERSION }),
      trash: new TrashService({ instance }),
    },
    web: webAssets(runOptions),
    validateResponses: dev || process.env.NODE_ENV === 'test',
    onHeartbeat: () => idle?.beat(),
    onInternalError: terminal.internalError,
  })

  const wanted = options.port ?? DEFAULT_PORT
  let started: Awaited<ReturnType<typeof listen>>
  try {
    started = await listen(app, wanted, options.port !== undefined)
  } catch (err) {
    if (err instanceof PortInUseError) {
      terminal.fatal(
        err.message,
        'Pick another one with --port, or leave it out to use a free one.',
      )
      process.exit(1)
    }
    throw err
  }
  const { server, port } = started

  const url = new URL(`http://${HOST}:${port}/`)
  if (auth.mode === 'token') url.searchParams.set(TOKEN_PARAM, auth.token)
  terminal.ready({
    instance: instance.instance,
    url: url.href,
    portFallback: port !== wanted && wanted !== 0 ? wanted : undefined,
  })

  if (options.open && !dev) terminal.opened(await openBrowser(url.href, options.browser))
  terminal.waiting(options.exitOnClose)

  let stopping = false
  async function shutdown(reason: string): Promise<void> {
    if (stopping) return
    stopping = true
    idle?.stop()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
    terminal.stopped(reason)
    process.exit(0)
  }

  process.on('SIGINT', () => {
    // A second Ctrl+C while shutting down forces the exit.
    if (stopping) process.exit(130)
    void shutdown('Server stopped.')
  })
  process.on('SIGTERM', () => void shutdown('Server stopped.'))
}

function webAssets({ embeddedWeb }: RunOptions): WebAssets {
  if (embeddedWeb) return { embedded: embeddedWeb }
  // The bundle lives at dist/bin.js with the web build copied to dist/web.
  return { dir: path.join(import.meta.dir, 'web') }
}

function isDirectory(p: string): boolean {
  return statSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false
}
