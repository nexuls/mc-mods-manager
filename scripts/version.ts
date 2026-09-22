// The release version lives in apps/cli/package.json (the published `mc-mod` package); nothing else
// carries it. This script reads or sets it.
//
//   bun scripts/version.ts                     print the current version
//   bun scripts/version.ts patch|minor|major   bump it (also prepatch, preminor, premajor, prerelease)
//   bun scripts/version.ts 1.2.0               set an exact version (must be higher)
//   --preid rc                                 prerelease id for pre* bumps (default: beta)
//
// Prints the new version on stdout, so CI can capture it.
import path from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { Bump, bumpVersion, PreId, Version } from './lib/semver'

const manifest = path.resolve(import.meta.dir, '../apps/cli/package.json')
const text = await Bun.file(manifest).text()
const current = z.object({ version: Version }).parse(JSON.parse(text)).version

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { preid: { type: 'string', default: 'beta' } },
})
const [arg] = z
  .tuple([z.string().trim().min(1)])
  .or(z.tuple([]))
  .parse(positionals)

if (arg === undefined) {
  console.log(current)
} else {
  const bump = Bump.safeParse(arg)
  const next = bump.success
    ? bumpVersion(current, bump.data, PreId.parse(values.preid))
    : Version.parse(arg.replace(/^v/, ''))
  if (Bun.semver.order(next, current) !== 1) {
    throw new Error(`${next} is not higher than the current version ${current}`)
  }
  // Replace just the version line so the rest of the file keeps its formatting.
  await Bun.write(manifest, text.replace(/"version": "[^"]*"/, `"version": "${next}"`))
  console.log(next)
}
