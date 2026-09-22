import { strToU8, zipSync } from 'fflate'

/** Builds a jar (zip) in memory from text entries. */
export function makeJar(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}
