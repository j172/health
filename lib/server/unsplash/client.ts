import "server-only";
import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";

const API_URL = "https://api.unsplash.com/search/photos";
const REQUEST_TIMEOUT_MS = 25_000;

export interface UnsplashImage {
  id: string;
  width: number;
  height: number;
  urls: {
    full: string;
    regular: string;
  };
  links: {
    html: string;
    // Per Unsplash's API Guidelines, this endpoint must be GET-pinged once
    // per download ("trigger download") — see downloadUnsplashImage in
    // lib/server/unsplash/download.ts.
    download_location: string;
  };
  user: {
    name: string;
  };
}

export interface UnsplashSearchResponse {
  total: number;
  totalHits: number;
  hits: UnsplashImage[];
}

export class UnsplashConfigurationError extends Error {
  constructor() {
    super("UNSPLASH_ACCESS_KEY is not configured.");
    this.name = "UnsplashConfigurationError";
  }
}

/**
 * Thrown for both the search call (this file) and the download call
 * (lib/server/unsplash/download.ts) so lib/server/news/imageProviders.ts can
 * catch one type and convert it to the shared ProviderRateLimitError,
 * regardless of which of the two calls actually hit the limit.
 */
export class UnsplashRateLimitError extends Error {
  constructor() {
    super("Unsplash API request failed with HTTP 429/403 (rate limited).");
    this.name = "UnsplashRateLimitError";
  }
}

/**
 * Unsplash search — last link in the Pixabay → Pexels → Unsplash fallback
 * chain (see lib/server/news/imageProviders.ts). Demo-tier apps are capped
 * at 50 req/hour, well below what this steady-state, backoff-aware cron
 * needs since it's only reached once the first two providers are exhausted
 * or cooling down.
 */
export const searchUnsplashImages = async (term: string, page: number, perPage = 30): Promise<UnsplashSearchResponse> => {
  if (!env.unsplash.accessKey) {
    throw new UnsplashConfigurationError();
  }

  const params = new URLSearchParams({
    query: term,
    orientation: "landscape",
    page: String(page),
    // Unsplash caps per_page at 30 (unlike Pixabay's 200/Pexels' 80).
    per_page: String(Math.min(30, Math.max(3, perPage))),
  });

  const response = await httpGetText(`${API_URL}?${params.toString()}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: {
      Accept: "application/json",
      Authorization: `Client-ID ${env.unsplash.accessKey}`,
      "Accept-Version": "v1",
    },
  });

  // Unsplash's demo tier (see this function's doc comment) signals its
  // 50 req/hour cap with HTTP 403, not 429 — confirmed live 2026-08-20 via
  // a direct curl against api.unsplash.com with this app's own key
  // (200 OK, x-ratelimit-limit: 50). Before this fix, a 403 fell through
  // to the generic error below, which cardImages.ts's orchestration loop
  // (lib/server/news/imageProviders.ts) treated as an ordinary per-term
  // failure rather than a rate limit — so the existing Pixabay-style
  // cooldown/backoff (providerCooldown.ts) never engaged for Unsplash, and
  // every subsequent term/article kept re-hammering an already-exhausted
  // quota for the rest of that hour instead of backing off.
  if (response.status === 429 || response.status === 403) {
    throw new UnsplashRateLimitError();
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Unsplash API request failed with HTTP ${response.status}.`);
  }

  const payload = JSON.parse(response.text) as { total?: number; results?: Partial<UnsplashImage>[] };
  if (!Array.isArray(payload.results)) {
    throw new Error("Unsplash API returned an invalid response.");
  }

  return {
    total: Number(payload.total || 0),
    totalHits: Number(payload.total || 0),
    hits: payload.results.filter(
      (hit): hit is UnsplashImage =>
        typeof hit?.id === "string" &&
        hit.id.length > 0 &&
        typeof hit?.urls?.regular === "string" &&
        hit.urls.regular.startsWith("https://") &&
        typeof hit?.links?.download_location === "string",
    ),
  };
};
