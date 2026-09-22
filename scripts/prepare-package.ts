// Copies the root README.md and LICENSE into apps/cli so the published `mc-mod` package has them.
// Relative links and images in the README are made absolute, pinned to the release tag (`v<version>`),
// so they keep working on npmjs.com.
import path from 'node:path'
import { z } from 'zod'

const REPO = 'nexuls/mc-mods-manager'

const root = path.resolve(import.meta.dir, '..')
const cliDir = path.join(root, 'apps/cli')

const { version } = z
  .object({ version: z.string() })
  .parse(await Bun.file(path.join(cliDir, 'package.json')).json())
const ref = `v${version}`

const absolute = (target: string, kind: 'raw' | 'blob') =>
  kind === 'raw'
    ? `https://raw.githubusercontent.com/${REPO}/${ref}/${target}`
    : `https://github.com/${REPO}/blob/${ref}/${target}`
const isRelative = (target: string) => !/^([a-z]+:|#|\/)/i.test(target)

const readme = (await Bun.file(path.join(root, 'README.md')).text())
  // HTML images: <img src="…">, <source srcset="…">
  .replace(/\b(src|srcset)="([^"]+)"/g, (m, attr: string, target: string) =>
    isRelative(target) ? `${attr}="${absolute(target, 'raw')}"` : m,
  )
  // Markdown links and images: [text](target), ![alt](target)
  .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (m, bang: string, text: string, target: string) =>
    isRelative(target) ? `${bang}[${text}](${absolute(target, bang ? 'raw' : 'blob')})` : m,
  )

await Bun.write(path.join(cliDir, 'README.md'), readme)
await Bun.write(path.join(cliDir, 'LICENSE'), Bun.file(path.join(root, 'LICENSE')))
console.log(`Copied README.md (links pinned to ${ref}) and LICENSE → apps/cli`)
