import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

/** Starts an app on a random 127.0.0.1 port. Use with `await using`. */
export async function listen(app: Express) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const { port } = server.address() as AddressInfo // listening on TCP, so address() is an AddressInfo
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    [Symbol.asyncDispose]: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
