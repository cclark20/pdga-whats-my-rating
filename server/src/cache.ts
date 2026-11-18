/**
 * Async key/value cache with per-entry TTL. Async so a Redis-backed
 * implementation can drop in later without touching callers.
 */
export interface Cache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

export class MemoryCache implements Cache {
  private entries = new Map<string, { value: unknown; expires: number }>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: { maxEntries?: number; now?: () => number } = {}) {
    this.maxEntries = opts.maxEntries ?? 5_000;
    this.now = opts.now ?? Date.now;
  }

  async get(key: string): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    // Maps iterate in insertion order, so the first key is the oldest write
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

/**
 * Wraps a cache with read-through loading and in-flight dedupe, so two
 * simultaneous lookups of the same key share one upstream request.
 * Failed loads are not cached.
 */
export function readThrough(cache: Cache) {
  const inflight = new Map<string, Promise<unknown>>();

  return async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
    const hit = await cache.get(key);
    if (hit !== undefined) return hit as T;

    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = load()
      .then(async (value) => {
        await cache.set(key, value, ttlMs);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };
}
