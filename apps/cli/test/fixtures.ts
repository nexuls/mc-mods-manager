import { cp, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const FIXTURES = path.join(import.meta.dir, 'fixtures')

/**
 * Copies `test/fixtures/<name>` into a fresh temp dir, so tests never touch a real Minecraft folder
 * or the checked-in fixtures. `__ROOT__` in JSON files becomes the copy's absolute path.
 * Use with `await using`.
 */
export async function copyFixture(name: string) {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), `mc-mod-${name}-`)))
  await cp(path.join(FIXTURES, name), dir, { recursive: true })
  for (const rel of await readdir(dir, { recursive: true })) {
    if (!rel.endsWith('.json')) continue
    const file = Bun.file(path.join(dir, rel))
    const text = await file.text()
    if (text.includes('__ROOT__')) await Bun.write(file, text.replaceAll('__ROOT__', dir))
  }
  return {
    dir,
    [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }),
  }
}
