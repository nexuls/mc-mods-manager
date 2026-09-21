// Copies the built web UI into the CLI package so the published `mc-mod` is self-contained.
import { cp, rm } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const from = path.join(root, 'apps/web/dist')
const to = path.join(root, 'apps/cli/dist/web')

if (!(await Bun.file(path.join(from, 'index.html')).exists())) {
  throw new Error(`Web build not found at ${from}. Run the web build first.`)
}

await rm(to, { recursive: true, force: true })
await cp(from, to, { recursive: true })
console.log(`Copied web UI → ${path.relative(root, to)}`)
