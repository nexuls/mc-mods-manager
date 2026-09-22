/** Parses the main section of META-INF/MANIFEST.MF (`Key: value`, continuation lines start with a space). */
export function parseManifest(text: string): Map<string, string> {
  const out = new Map<string, string>()
  let lastKey: string | undefined
  for (const line of text.split(/\r?\n/)) {
    if (line === '') break // end of the main section
    if (line.startsWith(' ') && lastKey) {
      out.set(lastKey, (out.get(lastKey) ?? '') + line.slice(1))
      continue
    }
    const i = line.indexOf(':')
    if (i <= 0) continue
    lastKey = line.slice(0, i).trim()
    out.set(lastKey, line.slice(i + 1).trim())
  }
  return out
}
