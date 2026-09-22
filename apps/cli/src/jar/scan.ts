import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { type JarCache, type JarCacheEntry, ModFileName } from '@mc-mod/shared'
import { hashBytes } from './hash'
import { readJarMetadata } from './read-metadata'

/** Bump when hashing or metadata parsing changes, so cached entries are recomputed. */
export const JAR_CACHE_VERSION = 1

/** Jars are read this many at a time, to bound memory with large modpacks. */
const CONCURRENCY = 8

const DISABLED = '.disabled'

export interface ScannedJar extends JarCacheEntry {
  fileName: string
  enabled: boolean
}

/** `x.jar.disabled` → `x.jar`. */
export function enabledName(fileName: string): string {
  return fileName.endsWith(DISABLED) ? fileName.slice(0, -DISABLED.length) : fileName
}

export function disabledName(fileName: string): string {
  return `${enabledName(fileName)}${DISABLED}`
}

/**
 * Lists `*.jar` and `*.jar.disabled` files in `dir` with their hashes and metadata. Files whose size and
 * mtime match the cache aren't read again. Returns the new cache, which only has entries for files present now.
 */
export async function scanJars(
  dir: string,
  cache: JarCache | undefined,
): Promise<{ jars: ScannedJar[]; cache: JarCache }> {
  const cached = cache?.version === JAR_CACHE_VERSION ? cache.files : {}
  const names = (await readdir(dir).catch(() => [])).filter((n) => ModFileName.safeParse(n).success)

  const jars: ScannedJar[] = []
  const queue = [...names]
  async function worker() {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
      const jar = await scanOne(path.join(dir, name), name, cached[enabledName(name)])
      if (jar) jars.push(jar)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  jars.sort((a, b) => a.fileName.localeCompare(b.fileName))
  const files: Record<string, JarCacheEntry> = {}
  for (const { fileName, enabled: _, ...entry } of jars) files[enabledName(fileName)] = entry
  return { jars, cache: { version: JAR_CACHE_VERSION, files } }
}

async function scanOne(
  file: string,
  fileName: string,
  cached: JarCacheEntry | undefined,
): Promise<ScannedJar | null> {
  const s = await stat(file).catch(() => null)
  if (!s?.isFile()) return null
  const enabled = !fileName.endsWith(DISABLED)
  if (cached && cached.size === s.size && cached.mtimeMs === s.mtimeMs) {
    return { ...cached, fileName, enabled }
  }
  const bytes = await Bun.file(file).bytes()
  const info = readJarMetadata(bytes)
  return {
    fileName,
    enabled,
    size: s.size,
    mtimeMs: s.mtimeMs,
    ...hashBytes(bytes),
    meta: info?.meta ?? null,
    minecraft: info?.minecraft ?? null,
  }
}
