import { describe, expect, test } from 'bun:test'
import { parseEnv, resolveTargetDir } from './env'

describe('parseEnv', () => {
  test('defaults', () => {
    expect(parseEnv({})).toEqual({ MC_MOD_DEV: false, MC_MOD_DIR: undefined })
  })

  test('parses MC_MOD_DEV flags', () => {
    expect(parseEnv({ MC_MOD_DEV: '1' }).MC_MOD_DEV).toBe(true)
    expect(parseEnv({ MC_MOD_DEV: 'false' }).MC_MOD_DEV).toBe(false)
    expect(() => parseEnv({ MC_MOD_DEV: 'yes' })).toThrow()
  })

  test('rejects blank MC_MOD_DIR', () => {
    expect(() => parseEnv({ MC_MOD_DIR: '  ' })).toThrow()
  })
})

describe('resolveTargetDir', () => {
  test('falls back to cwd', () => {
    expect(resolveTargetDir(parseEnv({}), '/tmp/x')).toBe('/tmp/x')
  })

  test('uses MC_MOD_DIR, resolved against cwd', () => {
    expect(resolveTargetDir(parseEnv({ MC_MOD_DIR: '/games/NeoForge 1.21.1/mods' }), '/tmp')).toBe(
      '/games/NeoForge 1.21.1/mods',
    )
    expect(resolveTargetDir(parseEnv({ MC_MOD_DIR: 'inst' }), '/tmp')).toBe('/tmp/inst')
  })
})
