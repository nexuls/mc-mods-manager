import { existsSync } from 'node:fs'
import path from 'node:path'
import express, { type Express } from 'express'
import { apiNotFound, createApiRouter, errorHandler } from './routes/adapter'
import { healthRoutes } from './routes/health'
import { instanceRoutes } from './routes/instance'
import { modsRoutes } from './routes/mods'
import { projectsRoutes } from './routes/projects'
import { type Auth, checkHost, requireToken } from './security'
import type { CatalogService } from './services/catalog'
import type { InstanceService } from './services/instance'
import type { LibraryService } from './services/library'

export interface AppOptions {
  auth: Auth
  services: { instance: InstanceService; library: LibraryService; catalog: CatalogService }
  /** Built web UI (`dist/web`). Missing in source/dev runs, where Vite serves the UI. */
  webDir: string
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

  app.use('/api', express.json())
  app.use(apiRouter)
  app.use('/api', apiNotFound)
  serveWeb(app, options.webDir)
  app.use(errorHandler(options.onInternalError ?? ((err) => console.error(err))))

  return { app, apiRouter }
}

function serveWeb(app: Express, webDir: string): void {
  const index = path.join(webDir, 'index.html')
  if (!existsSync(index)) {
    app.use((_req, res) => {
      res
        .status(404)
        .type('text')
        .send('The web UI is not built. In development, use the Vite dev server instead.')
    })
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
