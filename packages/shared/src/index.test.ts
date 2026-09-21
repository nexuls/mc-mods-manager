import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

describe('@mc-mod/shared', () => {
  test('zod resolves from the workspace catalog', () => {
    expect(z.string().parse('mc-mod')).toBe('mc-mod')
  })
})
