import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../errors'

// Every filesystem write goes through these helpers, which refuse paths outside the allowed base
// (the instance root or the export dir). The check is lexical, so symlinked mods folders keep working.

/** True if `target` is `base` or inside it. */
export function isInside(base: string, target: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * True if `a` and `b` are the same path. Windows and macOS compare without case, as their default
 * filesystems do, so a launcher's `C:\Users\Me` matches a `c:\users\me` typed in a terminal.
 */
export function samePath(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const [x, y] = [path.resolve(a), path.resolve(b)]
  return platform === 'win32' || platform === 'darwin'
    ? x.toLowerCase() === y.toLowerCase()
    : x === y
}

/** Resolves `target` (relative to `base`, or absolute) and throws if it escapes `base`. */
export function resolveInside(base: string, target: string): string {
  const resolved = path.resolve(base, target)
  if (!isInside(base, resolved)) {
    throw new AppError('BAD_REQUEST', `Path is outside ${base}: ${target}`)
  }
  return resolved
}

/** `<root>/.mc-mod`: state, temp downloads and trash. */
export function stateDir(root: string): string {
  return path.join(root, '.mc-mod')
}

/**
 * Writes via a temp file in the same directory and renames it into place, so readers never see a
 * half-written file. `mode` (e.g. 0o600 for files holding secrets) is set before the rename.
 */
export async function writeFileAtomic(
  base: string,
  target: string,
  data: string | Uint8Array,
  options: { mode?: number } = {},
): Promise<void> {
  const file = resolveInside(base, target)
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`,
  )
  try {
    await Bun.write(tmp, data)
    if (options.mode !== undefined) await chmod(tmp, options.mode)
    await rename(tmp, file)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}

/**
 * Renames `from` to `to`, both of which must be inside `base`. Fails with CONFLICT instead of replacing
 * an existing file.
 */
export async function renameInside(base: string, from: string, to: string): Promise<void> {
  const src = resolveInside(base, from)
  const dest = resolveInside(base, to)
  if (await stat(dest).catch(() => null)) {
    throw new AppError('CONFLICT', `${path.basename(dest)} already exists`)
  }
  await mkdir(path.dirname(dest), { recursive: true })
  try {
    await rename(src, dest)
  } catch (err) {
    // A mods folder symlinked to another drive can't be renamed across devices; copy instead.
    if (!(err instanceof Error && 'code' in err && err.code === 'EXDEV')) throw err
    await copyFile(src, dest)
    await rm(src)
  }
}

/**
 * Copies `from` over `to` via a temp file next to `to`, so `to` is never half-written. `from` must be
 * inside `base` too: exports only ever copy out of the instance.
 */
export async function copyFileAtomic(base: string, from: string, to: string): Promise<void> {
  const src = resolveInside(base, from)
  const dest = resolveInside(base, to)
  await mkdir(path.dirname(dest), { recursive: true })
  const tmp = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.${randomBytes(4).toString('hex')}.tmp`,
  )
  try {
    await copyFile(src, tmp)
    await rename(tmp, dest)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}

/** Deletes one file inside `base`. Missing files are fine. */
export async function removeInside(base: string, target: string): Promise<void> {
  await rm(resolveInside(base, target), { force: true })
}

/**
 * Moves a file from the content dir to `<root>/.mc-mod/trash/<timestamp>-<name>` instead of deleting it.
 * Returns the trash path.
 */
export async function moveToTrash(root: string, file: string, now = Date.now()): Promise<string> {
  const dest = path.join(stateDir(root), 'trash', `${now}-${path.basename(file)}`)
  await renameInside(root, file, dest)
  return dest
}

/** Sanitizes a filename from a platform API to a plain `.jar` basename. */
export function safeJarName(name: string): string {
  const base = path.basename(name.replaceAll('\\', '/'))
  if (!base.toLowerCase().endsWith('.jar') || base.startsWith('.') || base.length > 255) {
    throw new AppError('BAD_REQUEST', `Not a safe jar filename: ${name}`)
  }
  return base
}
