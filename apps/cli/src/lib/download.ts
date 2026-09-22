import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { AppError } from '../errors'
import type { Fetch } from '../providers/types'

/** Hosts we download jars from (architecture §9). */
export const DOWNLOAD_HOSTS: ReadonlySet<string> = new Set([
  'cdn.modrinth.com',
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
])

const TIMEOUT_MS = 5 * 60_000
/** Refuse bodies much larger than announced, or this big when the size isn't known. */
const MAX_BYTES = 512 * 1024 * 1024

export interface DownloadRequest {
  url: string
  sha1?: string
  sha512?: string
  /** Expected size in bytes, for progress and a sanity limit. */
  size?: number
  /** Where to write. The caller resolves it inside the instance (`.mc-mod/tmp/`). */
  file: string
  headers?: Record<string, string>
  onProgress?: (received: number, total: number) => void
}

/**
 * Streams a download to `file` while hashing it, then checks every hash the platform gave. On any failure
 * the partial file is removed. Only allowlisted HTTPS hosts, and at least one hash is required.
 */
export async function downloadVerified(
  req: DownloadRequest,
  fetch: Fetch,
): Promise<{ sha1: string; sha512: string; size: number }> {
  const url = new URL(req.url)
  if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new AppError('PROVIDER_ERROR', `Refusing to download from ${url.origin}`)
  }
  if (!req.sha1 && !req.sha512) {
    throw new AppError('HASH_MISMATCH', 'The platform gave no hash to verify this file with')
  }

  const res = await fetch(url.href, {
    headers: req.headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err: unknown) => {
    throw new AppError('PROVIDER_ERROR', `Download failed: ${String(err)}`)
  })
  if (!res.ok || !res.body) {
    throw new AppError('PROVIDER_ERROR', `Download failed with HTTP ${res.status}`)
  }

  const total = req.size ?? Number(res.headers.get('Content-Length') ?? 0)
  const limit = total > 0 ? Math.ceil(total * 1.1) + 1024 : MAX_BYTES
  const sha1 = new Bun.CryptoHasher('sha1')
  const sha512 = new Bun.CryptoHasher('sha512')
  await mkdir(path.dirname(req.file), { recursive: true })
  const writer = Bun.file(req.file).writer()
  let received = 0
  try {
    for await (const chunk of res.body) {
      received += chunk.byteLength
      if (received > limit) throw new AppError('PROVIDER_ERROR', 'Download is larger than expected')
      sha1.update(chunk)
      sha512.update(chunk)
      writer.write(chunk)
      req.onProgress?.(received, total)
    }
    await writer.end()
  } catch (err) {
    await Promise.resolve(writer.end()).catch(() => {})
    await rm(req.file, { force: true })
    if (err instanceof AppError) throw err
    throw new AppError('PROVIDER_ERROR', `Download failed: ${String(err)}`)
  }

  const got = { sha1: sha1.digest('hex'), sha512: sha512.digest('hex'), size: received }
  const mismatch =
    (req.sha1 && req.sha1.toLowerCase() !== got.sha1) ||
    (req.sha512 && req.sha512.toLowerCase() !== got.sha512)
  if (mismatch) {
    await rm(req.file, { force: true })
    throw new AppError('HASH_MISMATCH', 'The downloaded file does not match its published hash')
  }
  return got
}
