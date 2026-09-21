import { describe, expect, test } from 'bun:test'
import { CliOptions, createProgram, parseOptions } from './options'

const argv = (...args: string[]) => ['bun', 'mc-mod', ...args]

function parseArgs(...args: string[]) {
  const program = createProgram()
    .exitOverride()
    .configureOutput({ writeErr: () => {}, writeOut: () => {} })
  return parseOptions(program, argv(...args))
}

describe('parseOptions', () => {
  test('defaults', () => {
    expect(parseArgs()).toEqual({ open: true, browser: 'auto', exitOnClose: false })
  })

  test('all flags', () => {
    expect(
      parseArgs('-d', 'srv', '-p', '8080', '--no-open', '-b', 'tab', '--exit-on-close'),
    ).toEqual({ dir: 'srv', port: 8080, open: false, browser: 'tab', exitOnClose: true })
  })

  test('rejects bad ports and browser modes', () => {
    expect(() => parseArgs('-p', 'abc')).toThrow('--port')
    expect(() => parseArgs('-p', '70000')).toThrow('--port')
    expect(() => parseArgs('-b', 'firefox')).toThrow()
  })
})

test('CliOptions is strict', () => {
  expect(CliOptions.safeParse({ open: true, browser: 'auto', extra: 1 }).success).toBe(false)
})
