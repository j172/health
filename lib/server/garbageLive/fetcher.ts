import { httpGetText } from "@/lib/server/net/httpClient";
import type { LiveFetcher } from "@/lib/server/garbageLive/types";

/** Socket idle timeout for one live-position request. */
const REQUEST_TIMEOUT_MS = 8_000;
/** A live-position feed is a few KB; anything near this size is not the feed. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Production fetcher for the live-truck feeds: the shared node:http(s) client,
 * never global fetch() (undici's WASM parser OOMs under this host's ulimit -v).
 */
export const defaultLiveFetcher: LiveFetcher = (url) =>
  httpGetText(url, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    headers: { Accept: "text/csv, application/json;q=0.9, */*;q=0.5" },
  });
