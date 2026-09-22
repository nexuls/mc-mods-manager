import { describe, expect, test } from 'bun:test'
import path from 'node:path'
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

  test('a blank CURSEFORGE_API_KEY counts as unset', () => {
    expect(parseEnv({ CURSEFORGE_API_KEY: ' ' }).CURSEFORGE_API_KEY).toBeUndefined()
    expect(parseEnv({ CURSEFORGE_API_KEY: ' k ' }).CURSEFORGE_API_KEY).toBe('k')
  })

  test('rejects blank MC_MOD_DIR', () => {
    expect(() => parseEnv({ MC_MOD_DIR: '  ' })).toThrow()
  })
})

describe('resolveTargetDir', () => {
  test('falls back to cwd', () => {
    expect(resolveTargetDir({ env: parseEnv({}) }, '/tmp/x')).toBe(path.resolve('/tmp/x'))
  })

  test('uses MC_MOD_DIR, resolved against cwd', () => {
    const abs = parseEnv({ MC_MOD_DIR: '/games/NeoForge 1.21.1/mods' })
    expect(resolveTargetDir({ env: abs }, '/tmp')).toBe(path.resolve('/games/NeoForge 1.21.1/mods'))
    expect(resolveTargetDir({ env: parseEnv({ MC_MOD_DIR: 'inst' }) }, '/tmp')).toBe(
      path.resolve('/tmp/inst'),
    )
  })

  test('--dir overrides MC_MOD_DIR', () => {
    const env = parseEnv({ MC_MOD_DIR: '/games/a' })
    expect(resolveTargetDir({ dir: '../b', env }, '/tmp/x')).toBe(path.resolve('/tmp/b'))
  })
})
