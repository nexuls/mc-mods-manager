import { readdir, stat } from 'node:fs/promises'

export async function exists(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null)) !== null
}

export async function isDir(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null))?.isDirectory() ?? false
}

/** Directory entries, or [] if it doesn't exist or can't be read. */
export async function list(dir: string): Promise<string[]> {
  return readdir(dir).catch(() => [])
}

/** Parsed JSON, or undefined when the file is missing or not JSON. Callers validate with zod. */
export async function readJson(p: string): Promise<unknown> {
  try {
    return await Bun.file(p).json()
  } catch {
    return undefined
  }
}

export async function readText(p: string): Promise<string | undefined> {
  try {
    return await Bun.file(p).text()
  } catch {
    return undefined
  }
}

/** The highest-sorting subdirectory name that matches `pattern` (e.g. a version folder). */
export async function findSubdir(
  dir: string,
  pattern: RegExp,
  compare: (a: string, b: string) => number,
): Promise<string | undefined> {
  const names = (await list(dir)).filter((n) => pattern.test(n))
  return names.sort(compare).at(-1)
}
