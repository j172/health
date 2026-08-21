type CacheEntry<T> = { value: T; expiresAt: number };

/**
 * Hard ceiling on distinct cached keys.
 *
 * Some keys embed user-controlled input (the news `?keyword=` search builds
 * `list_news_..._${keyword}`), so an unbounded map is a crawler-driven memory
 * leak on a host with a ~768MB heap cap. When the map is full we evict expired
 * entries first, then the oldest insertions — Map preserves insertion order, so
 * the first keys it yields are the least recently *added*.
 */
const MAX_ENTRIES = 500;

const memoryStore = new Map<string, CacheEntry<unknown>>();

const evictIfFull = (now: number): void => {
  if (memoryStore.size < MAX_ENTRIES) return;

  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }

  // Still full: every entry is live, so drop oldest-first until there's headroom.
  while (memoryStore.size >= MAX_ENTRIES) {
    const oldest = memoryStore.keys().next();
    if (oldest.done) break;
    memoryStore.delete(oldest.value);
  }
};

/**
 * Lightweight 60-second in-memory cache for high-frequency DB queries.
 * Prevents redundant database hits across requests while keeping data fresh.
 */
export async function memoizeQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 60,
): Promise<T> {
  const now = Date.now();
  const cached = memoryStore.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  if (cached) memoryStore.delete(key);

  const fresh = await fetcher();
  evictIfFull(Date.now());
  memoryStore.set(key, {
    value: fresh,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return fresh;
}

/** Test/ops hook: drop everything currently cached. */
export function clearMemoizedQueries(): void {
  memoryStore.clear();
}

/** Current number of cached keys — used by the ops status endpoint. */
export function memoizedQueryCount(): number {
  return memoryStore.size;
}
