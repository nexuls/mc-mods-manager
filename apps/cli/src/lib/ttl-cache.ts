/**
 * In-memory cache of promises with a per-entry TTL and a size cap (oldest entry evicted first).
 * Concurrent callers for the same key share one promise; a rejected promise is dropped so the next
 * call retries.
 */
export class TtlCache {
  private readonly entries = new Map<string, { expires: number; value: Promise<unknown> }>()

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit && hit.expires > this.now()) {
      // Re-insert so eviction goes by last use.
      this.entries.delete(key)
      this.entries.set(key, hit)
      // Only `load` for this key ever fills the entry, so the stored promise is a Promise<T>.
      return hit.value as Promise<T>
    }
    const value = load()
    this.entries.delete(key)
    this.entries.set(key, { expires: this.now() + ttlMs, value })
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
    })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return value
  }
}
