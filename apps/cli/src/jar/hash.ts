/** The hashes both platforms index a file by. */
export interface FileHashes {
  /** Hex. Modrinth's lookup key (`POST /version_files`). */
  sha1: string
  /** Hex. Modrinth verifies downloads with it. */
  sha512: string
  /** CurseForge fingerprint (`POST /fingerprints`), an unsigned 32-bit integer. */
  cfFingerprint: number
}

export function hashBytes(bytes: Uint8Array): FileHashes {
  return {
    sha1: new Bun.CryptoHasher('sha1').update(bytes).digest('hex'),
    sha512: new Bun.CryptoHasher('sha512').update(bytes).digest('hex'),
    cfFingerprint: curseForgeFingerprint(bytes),
  }
}

const M = 0x5bd1e995

/** MurmurHash2, 32-bit, little-endian (Austin Appleby's reference `MurmurHash2`). */
export function murmur2(data: Uint8Array, seed: number): number {
  let len = data.length
  let h = (seed ^ len) >>> 0
  let i = 0
  while (len >= 4) {
    let k =
      (data[i] ?? 0) |
      ((data[i + 1] ?? 0) << 8) |
      ((data[i + 2] ?? 0) << 16) |
      ((data[i + 3] ?? 0) << 24)
    k = Math.imul(k, M)
    k ^= k >>> 24
    k = Math.imul(k, M)
    h = Math.imul(h, M) ^ k
    i += 4
    len -= 4
  }
  // Tail bytes, falling through like the C switch.
  if (len === 3) h ^= (data[i + 2] ?? 0) << 16
  if (len >= 2) h ^= (data[i + 1] ?? 0) << 8
  if (len >= 1) {
    h ^= data[i] ?? 0
    h = Math.imul(h, M)
  }
  h ^= h >>> 13
  h = Math.imul(h, M)
  h ^= h >>> 15
  return h >>> 0
}

/** Tab, LF, CR and space: CurseForge drops these bytes before hashing. */
const WHITESPACE = new Set([9, 10, 13, 32])

/** CurseForge file fingerprint: MurmurHash2 (seed 1) of the file with whitespace bytes removed. */
export function curseForgeFingerprint(bytes: Uint8Array): number {
  const kept = new Uint8Array(bytes.length)
  let n = 0
  for (const b of bytes) {
    if (!WHITESPACE.has(b)) kept[n++] = b
  }
  return murmur2(kept.subarray(0, n), 1)
}
