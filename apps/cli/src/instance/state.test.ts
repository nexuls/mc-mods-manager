import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readState, stateFile, updateState } from './state'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mc-mod-state-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('missing file is an empty state', async () => {
  expect(await readState(root)).toEqual({ state: { schemaVersion: 1 } })
})

test('round trip keeps unknown fields', async () => {
  await Bun.write(stateFile(root), JSON.stringify({ schemaVersion: 1, future: 1 }))
  await updateState(root, (s) => ({ ...s, instance: { loader: 'fabric' } }))
  expect((await readState(root)).state).toEqual({
    schemaVersion: 1,
    future: 1,
    instance: { loader: 'fabric' },
  })
})

test('broken file is backed up and ignored', async () => {
  await Bun.write(stateFile(root), '{ nope')
  const { state, warning } = await readState(root)
  expect(state).toEqual({ schemaVersion: 1 })
  expect(warning).toContain('not valid JSON')
  expect(await Bun.file(`${stateFile(root)}.broken`).text()).toBe('{ nope')
})

test('schema mismatch is reported', async () => {
  await Bun.write(stateFile(root), JSON.stringify({ schemaVersion: 1, instance: { loader: 'x' } }))
  expect((await readState(root)).warning).toContain('loader')
})

test('concurrent updates are applied one after another', async () => {
  await Promise.all([
    updateState(root, (s) => ({ ...s, a: 1 })),
    updateState(root, (s) => ({ ...s, b: 2 })),
    updateState(root, (s) => ({ ...s, instance: { loader: 'quilt' } })),
  ])
  expect((await readState(root)).state).toEqual({
    schemaVersion: 1,
    a: 1,
    b: 2,
    instance: { loader: 'quilt' },
  })
})

test('a failed update does not block the next one', async () => {
  const failed = updateState(root, () => {
    throw new Error('boom')
  })
  const next = updateState(root, (s) => ({ ...s, instance: { loader: 'forge' } }))
  await expect(failed).rejects.toThrow('boom')
  expect((await next).instance).toEqual({ loader: 'forge' })
})
