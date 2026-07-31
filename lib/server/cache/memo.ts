type CacheEntry<T> = { value: T; expiresAt: number };

const memoryStore = new Map<string, CacheEntry<unknown>>();

/**
 * Lightweight 60-second in-memory cache for high-frequency DB queries.
 * Prevents redundant database hits across requests while keeping data fresh.
 */
export async function memoizeQuery<T>(key: string, fetcher: () => Promise<T>, ttlSeconds = 60): Promise<T> {
  const now = Date.now();
  const cached = memoryStore.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const fresh = await fetcher();
  memoryStore.set(key, { value: fresh, expiresAt: now + ttlSeconds * 1000 });
  return fresh;
}
