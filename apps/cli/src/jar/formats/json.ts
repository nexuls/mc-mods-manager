/**
 * Lenient JSON.parse for jar metadata: strips a BOM and retries with control characters (raw newlines
 * inside strings, a common authoring mistake that Fabric Loader tolerates) replaced by spaces.
 */
export function parseLenientJson(text: string): unknown {
  const clean = text.replace(/^﻿/, '')
  try {
    return JSON.parse(clean)
  } catch {
    try {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
      return JSON.parse(clean.replace(/[\u0000-\u001f]/g, ' '))
    } catch {
      return undefined
    }
  }
}

/** Dependency ids that are the platform itself, not something to install. */
export const PLATFORM_IDS = new Set([
  'minecraft',
  'java',
  'fabricloader',
  'fabric-loader',
  'quilt_loader',
  'forge',
  'neoforge',
])
