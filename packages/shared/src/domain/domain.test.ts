import { describe, expect, test } from 'bun:test'
import { GameVersion, Loader, loaderInfo, ModFileName, State } from './index'

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

test('State drops a jar cache it cannot read instead of failing', () => {
  const s = State.parse({
    schemaVersion: 1,
    jarCache: { version: 1, files: { 'a.jar': { size: -1 } } },
  })
  expect(s.jarCache).toBeUndefined()
})

describe('ModFileName', () => {
  test.each(['sodium-0.6.jar', 'Mod Name.JAR', 'x.jar.disabled'])('accepts %s', (n) => {
    expect(ModFileName.safeParse(n).success).toBe(true)
  })

  test.each(['', 'a.zip', '../a.jar', 'dir/a.jar', 'a\\b.jar', '.hidden.jar', 'a.disabled'])(
    'rejects %p',
    (n) => {
      expect(ModFileName.safeParse(n).success).toBe(false)
    },
  )
})
