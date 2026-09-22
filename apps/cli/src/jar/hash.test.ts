import { describe, expect, test } from 'bun:test'
import { curseForgeFingerprint, hashBytes, murmur2 } from './hash'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('murmur2', () => {
  // Values from Austin Appleby's C MurmurHash2, compiled and run on the same inputs.
  test.each([
    ['', 0, 0],
    ['The quick brown fox jumps over the lazy dog', 0x9747b28c, 495243318],
    ['a', 1, 626045324],
    ['ab', 1, 1692487918],
    ['abc', 1, 1621425345],
    ['abcd', 1, 3376380438],
    ['abcde', 1, 3469237630],
  ])('%p with seed %d', (input, seed, expected) => {
    expect(murmur2(bytes(input), seed)).toBe(expected)
  })

  test('treats bytes as unsigned', () => {
    expect(murmur2(new Uint8Array([0xff, 0xfe, 0x80, 0x81, 0x90]), 1)).toBe(877556310)
  })
})

describe('curseForgeFingerprint', () => {
  test('ignores tab, newline, carriage return and space', () => {
    expect(curseForgeFingerprint(bytes('a b\tc\r\nd'))).toBe(murmur2(bytes('abcd'), 1))
  })

  test('keeps other bytes', () => {
    expect(curseForgeFingerprint(new Uint8Array([0, 11, 12, 255]))).toBe(
      murmur2(new Uint8Array([0, 11, 12, 255]), 1),
    )
  })
})

test('hashBytes gives hex sha1/sha512 and the fingerprint', () => {
  const h = hashBytes(bytes('abc'))
  expect(h.sha1).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  expect(h.sha512).toStartWith('ddaf35a193617aba')
  expect(h.cfFingerprint).toBe(murmur2(bytes('abc'), 1))
})
