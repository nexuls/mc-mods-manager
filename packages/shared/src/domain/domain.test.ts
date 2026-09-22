import { describe, expect, test } from 'bun:test'
import { GameVersion, Loader, loaderInfo, State } from './index'

test('every loader has info', () => {
  for (const l of Loader.options) expect(loaderInfo[l].label).toBeTruthy()
})

describe('GameVersion', () => {
  test.each(['1.21.1', '26.2', '24w14a', '1.21-pre1', '1.21.2-rc1'])('accepts %s', (v) => {
    expect(GameVersion.safeParse(v).success).toBe(true)
  })

  test.each(['', '1.21/..', 'a b'])('rejects %p', (v) => {
    expect(GameVersion.safeParse(v).success).toBe(false)
  })
})

test('State keeps unknown top-level fields', () => {
  const s = State.parse({ schemaVersion: 1, future: { x: 1 } })
  expect(s).toEqual({ schemaVersion: 1, future: { x: 1 } })
})
