import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../errors'

// Every filesystem write goes through these helpers, which refuse paths outside the allowed base
// (the instance root or the export dir). The check is lexical, so symlinked mods folders keep working.

/** True if `target` is `base` or inside it. */
export function isInside(base: string, target: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
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
 * half-written file.
 */
export async function writeFileAtomic(
  base: string,
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const file = resolveInside(base, target)
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomBytes(4).toString('hex')}.tmp`,
  )
  try {
    await Bun.write(tmp, data)
    await rename(tmp, file)
  } catch (err) {
    await rm(tmp, { force: true })
    throw err
  }
}

/** Sanitizes a filename from a platform API to a plain `.jar` basename. */
export function safeJarName(name: string): string {
  const base = path.basename(name.replaceAll('\\', '/'))
  if (!base.toLowerCase().endsWith('.jar') || base.startsWith('.') || base.length > 255) {
    throw new AppError('BAD_REQUEST', `Not a safe jar filename: ${name}`)
  }
  return base
}
