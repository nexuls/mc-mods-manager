import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { emptyState, State } from '@mc-mod/shared'
import { z } from 'zod'
import { resolveInside, stateDir, writeFileAtomic } from './paths'

export function stateFile(root: string): string {
  return path.join(stateDir(root), 'state.json')
}

/**
 * Reads `.mc-mod/state.json`. A missing file is an empty state. An unreadable one is copied to
 * `state.json.broken` and treated as empty, since the state is only a cache.
 */
export async function readState(root: string): Promise<{ state: State; warning?: string }> {
  const file = Bun.file(stateFile(root))
  if (!(await file.exists())) return { state: emptyState() }

  let raw: unknown
  try {
    raw = await file.json()
  } catch {
    raw = undefined
  }
  const parsed = State.safeParse(raw)
  if (parsed.success) return { state: parsed.data }

  await copyFile(stateFile(root), resolveInside(root, `${stateFile(root)}.broken`))
  const why = raw === undefined ? 'not valid JSON' : z.prettifyError(parsed.error)
  return {
    state: emptyState(),
    warning: `Ignored .mc-mod/state.json (${why}). A copy was saved as state.json.broken.`,
  }
}

export async function writeState(root: string, state: State): Promise<void> {
  await writeFileAtomic(root, stateFile(root), `${JSON.stringify(State.parse(state), null, 2)}\n`)
}

/** Read-modify-write. Callers are serialized by the single-process server, so no locking. */
export async function updateState(root: string, update: (s: State) => State): Promise<State> {
  const { state } = await readState(root)
  const next = update(state)
  await writeState(root, next)
  return next
}
