/**
 * Tiny LRU with TTL over a caller-supplied Map (so the backing Map can be a
 * process-wide memoryStore). Pure; `now` is injectable for tests.
 */
export type LruEntry<V> = { value: V; expiresAt: number }

export class TtlLru<V> {
  constructor(
    private readonly map: Map<string, LruEntry<V>>,
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key)
      return undefined
    }
    // Refresh recency: Map iteration order is insertion order.
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: string, value: V, ttlMs = this.ttlMs): void {
    this.map.delete(key)
    this.map.set(key, { value, expiresAt: this.now() + ttlMs })
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  get size(): number {
    return this.map.size
  }
}

/**
 * Fixed-window counter (per key per window). Returns the count after
 * incrementing by `amount`; callers compare against their limit.
 */
export function incrementWindow(
  map: Map<string, LruEntry<number>>,
  key: string,
  windowMs: number,
  now: number,
  amount = 1,
): number {
  const entry = map.get(key)
  if (!entry || entry.expiresAt <= now) {
    map.set(key, { value: amount, expiresAt: now + windowMs })
    return amount
  }
  entry.value += amount
  return entry.value
}
