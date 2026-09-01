/**
 * Server-side in-process cache — fast Map-based store with TTL support.
 *
 * Since each endpoint execution shares the same Node.js process, module-level
 * state persists across requests. This cache stores expensive DB lookups
 * (e.g. Sadhana field definitions) so subsequent calls are pure memory reads.
 *
 * Cache keys are invalidated via serverCacheInvalidate(prefix) — call this
 * from an admin endpoint whenever the underlying DB data changes.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Module-level Map — persists for the lifetime of the server process
const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
let cacheGeneration = 0;

/** Read a cached value. Returns null if missing or expired. */
export function serverCacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Write a value to the cache with a TTL. Default TTL = 1 hour. */
export function serverCacheSet<T>(key: string, data: T, ttlMs = 60 * 60 * 1000): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Delete all cache entries whose key starts with `prefix`.
 * Omit prefix to clear the entire cache.
 */
export function serverCacheInvalidate(prefix?: string): void {
  cacheGeneration++;
  if (!prefix) {
    store.clear();
    inFlight.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of Array.from(inFlight.keys())) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}

/**
 * Read-through helper: returns the cached value if fresh,
 * otherwise calls `fetcher`, caches the result, and returns it.
 *
 * @param key       Cache key
 * @param fetcher   Async function to produce the value on cache miss
 * @param ttlMs     Time-to-live in milliseconds (default 1 hour)
 */
export async function serverCacheGetOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 60 * 60 * 1000
): Promise<T> {
  const cached = serverCacheGet<T>(key);
  if (cached !== null) return cached;
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const generation = cacheGeneration;
  const request = (async () => {
    const data = await fetcher();
    if (generation === cacheGeneration) serverCacheSet(key, data, ttlMs);
    return data;
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}

/** Returns a snapshot of all live cache keys (useful for debugging). */
export function serverCacheKeys(): string[] {
  const now = Date.now();
  return Array.from(store.entries())
    .filter(([, v]) => v.expiresAt > now)
    .map(([k]) => k);
}
