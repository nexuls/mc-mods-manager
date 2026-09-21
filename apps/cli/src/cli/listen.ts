import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

export const HOST = '127.0.0.1'

export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`Port ${port} is already in use`)
    this.name = 'PortInUseError'
  }
}

/**
 * Listens on 127.0.0.1 only. With `strict`, the port must be free; otherwise a taken port falls back to
 * a random free one (port 0).
 */
export async function listen(
  app: Express,
  port: number,
  strict: boolean,
): Promise<{ server: Server; port: number }> {
  try {
    return await listenOnce(app, port)
  } catch (err) {
    if (err instanceof PortInUseError && !strict && port !== 0) return listenOnce(app, 0)
    throw err
  }
}

function listenOnce(app: Express, port: number): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST)
    server.once('listening', () => {
      const address = server.address() as AddressInfo // a TCP listener always reports an AddressInfo
      resolve({ server, port: address.port })
    })
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'EADDRINUSE' ? new PortInUseError(port) : err)
    })
  })
}
