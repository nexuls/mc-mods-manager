import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Express } from 'express'
import { apiNotFound, createApiRouter, errorHandler } from './routes/adapter'
import { exportRoutes } from './routes/export'
import { healthRoutes } from './routes/health'
import { installRoutes } from './routes/install'
import { instanceRoutes } from './routes/instance'
import { modsRoutes } from './routes/mods'
import { projectsRoutes } from './routes/projects'
import { settingsRoutes } from './routes/settings'
import { shareRoutes } from './routes/share'
import { trashRoutes } from './routes/trash'
import { type Auth, checkHost, requireToken } from './security'
import type { CatalogService } from './services/catalog'
import type { InstallerService } from './services/installer'
import type { InstanceService } from './services/instance'
import type { JobService } from './services/jobs'
import type { LibraryService } from './services/library'
import type { ServerExportService } from './services/server-export'
import type { SettingsService } from './services/settings'
import type { ShareService } from './services/share'
import type { TrashService } from './services/trash'
import type { UpdatesService } from './services/updates'

/**
 * Where the built web UI comes from: a directory on disk (`dist/web` next to the bundle), or the
 * files embedded in a standalone binary, keyed by URL path (`/index.html`, `/assets/…`).
 */
export type WebAssets = { dir: string } | { embedded: Readonly<Record<string, string>> }

export interface AppOptions {
  auth: Auth
  services: {
    instance: InstanceService
    library: LibraryService
    catalog: CatalogService
    installer: InstallerService
    jobs: JobService
    settings: SettingsService
    updates: UpdatesService
    serverExport: ServerExportService
    share: ShareService
    trash: TrashService
  }
  /** The built web UI. Missing in source/dev runs, where Vite serves the UI. */
  web: WebAssets
  /** Validate responses against the contract (dev and tests). */
  validateResponses: boolean
  /** Called on every health request; drives `--exit-on-close`. */
  onHeartbeat?: () => void
  /** Called with unexpected errors before a 500 is sent. */
  onInternalError?: (err: unknown) => void
}

/** Builds the Express app without listening, so tests can drive it on port 0. */
export function createApp(options: AppOptions): { app: Express; apiRouter: express.Router } {
  const app = express()
  app.disable('x-powered-by')
  // The Vite dev proxy forwards its own Host, so dev mode skips the checks.
  if (options.auth.mode === 'token') {
    app.use(checkHost)
    app.use('/api', requireToken(options.auth.token))
  }

  const apiRouter = createApiRouter({ validateResponses: options.validateResponses })
  healthRoutes(apiRouter, { onHeartbeat: options.onHeartbeat ?? (() => {}) })
  instanceRoutes(apiRouter, options.services)
  modsRoutes(apiRouter, options.services)
  projectsRoutes(apiRouter, options.services)
  installRoutes(apiRouter, options.services)
  settingsRoutes(apiRouter, options.services)
  exportRoutes(apiRouter, options.services)
  shareRoutes(apiRouter, options.services)
  trashRoutes(apiRouter, options.services)

  // A shared mod list of a few hundred mods is past body-parser's 100kb default.
  app.use('/api', express.json({ limit: '4mb' }))
  app.use(apiRouter)
  app.use('/api', apiNotFound)
  if ('embedded' in options.web) serveEmbeddedWeb(app, options.web.embedded)
  else serveWeb(app, options.web.dir)
  app.use(errorHandler(options.onInternalError ?? ((err) => console.error(err))))

  return { app, apiRouter }
}

function serveWeb(app: Express, webDir: string): void {
  const index = path.join(webDir, 'index.html')
  if (!existsSync(index)) {
    webNotBuilt(app)
    return
  }

  // Vite puts content-hashed files under /assets, so they can be cached forever.
  app.use(
    '/assets',
    express.static(path.join(webDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  )
  app.use(express.static(webDir, { index: false }))
  // SPA fallback: client-side routes all get index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-store')
    res.sendFile(index)
  })
}

/** Serves the web UI embedded in a standalone binary, with the same caching and SPA fallback. */
function serveEmbeddedWeb(app: Express, files: Readonly<Record<string, string>>): void {
  const index = files['/index.html']
  if (index === undefined) {
    webNotBuilt(app)
    return
  }
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    try {
      // Unknown paths are client-side routes: they get index.html, like `serveWeb`.
      const sent = (Object.hasOwn(files, req.path) ? files[req.path] : undefined) ?? index
      if (sent === index) res.setHeader('Cache-Control', 'no-store')
      else if (req.path.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      res.type(path.extname(sent)).send(Buffer.from(await Bun.file(sent).arrayBuffer()))
    } catch (err) {
      next(err)
    }
  })
}

function webNotBuilt(app: Express): void {
  app.use((_req, res) => {
    res
      .status(404)
      .type('text')
      .send('The web UI is not built. In development, use the Vite dev server instead.')
  })
}
