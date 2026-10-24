import "server-only";
import { httpGetText } from "@/lib/server/net/httpClient";
import { parsePowerOutagesXml, type PowerOutagesResponse } from "./outageParser";

const TAIPOWER_OUTAGES_URL =
  "https://service.taipower.com.tw/data/opendata/apply/file/d006012/001.xml";

const CACHE_TTL_MS = 60_000; // 60 seconds TTL
const SWR_WINDOW_MS = 300_000; // 5 minutes SWR window

interface CachedEntry {
  data: PowerOutagesResponse;
  cachedAt: number;
}

let inMemoryCache: CachedEntry | null = null;
let activeFetchPromise: Promise<PowerOutagesResponse> | null = null;

async function fetchFromUpstream(): Promise<PowerOutagesResponse> {
  const { status, text } = await httpGetText(TAIPOWER_OUTAGES_URL, { timeoutMs: 10_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`Taipower d006012 request failed: HTTP ${status}`);
  }
  const parsed = parsePowerOutagesXml(text);
  inMemoryCache = {
    data: parsed,
    cachedAt: Date.now(),
  };
  return parsed;
}

/**
 * Retrieves the current power outages snapshot from Taipower open data.
 * Results are cached in memory for 60 seconds with stale-while-revalidate (SWR).
 *
 * @param forceRefresh Force bypassing the cache and fetching fresh data
 */
export async function getPowerOutages(forceRefresh = false): Promise<PowerOutagesResponse> {
  const now = Date.now();

  // Fresh cache hit
  if (!forceRefresh && inMemoryCache && now - inMemoryCache.cachedAt < CACHE_TTL_MS) {
    return inMemoryCache.data;
  }

  // Stale cache hit: return stale data immediately and trigger background revalidation
  if (!forceRefresh && inMemoryCache && now - inMemoryCache.cachedAt < SWR_WINDOW_MS) {
    if (!activeFetchPromise) {
      activeFetchPromise = fetchFromUpstream()
        .catch((err) => {
          console.error("Background SWR revalidation failed for power outages:", err);
          return inMemoryCache!.data;
        })
        .finally(() => {
          activeFetchPromise = null;
        });
    }
    return inMemoryCache.data;
  }

  // Cache miss or expired beyond SWR or forceRefresh: wait for fetch
  if (!activeFetchPromise) {
    activeFetchPromise = fetchFromUpstream().finally(() => {
      activeFetchPromise = null;
    });
  }

  try {
    return await activeFetchPromise;
  } catch (err) {
    console.error("Failed to fetch power outages from upstream:", err);
    // If we have stale cache, return it rather than failing
    if (inMemoryCache) {
      return inMemoryCache.data;
    }
    // Return safe empty response
    return parsePowerOutagesXml("");
  }
}
