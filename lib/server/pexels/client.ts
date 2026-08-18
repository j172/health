import "server-only";
import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";

const API_URL = "https://api.pexels.com/v1/search";
const REQUEST_TIMEOUT_MS = 25_000;

export interface PexelsImage {
  id: number;
  url: string;
  photographer: string;
  width: number;
  height: number;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
}

export interface PexelsSearchResponse {
  total: number;
  totalHits: number;
  hits: PexelsImage[];
}

export class PexelsConfigurationError extends Error {
  constructor() {
    super("PEXELS_API_KEY is not configured.");
    this.name = "PexelsConfigurationError";
  }
}

/**
 * Pexels search — same free-text term rotation strategy as Pixabay's
 * searchHealthImages (see lib/server/pixabay/client.ts), just against a
 * different API surface. Pexels' default tier (200 req/hour, 20,000/month)
 * is used here as the fallback provider once Pixabay is exhausted or
 * cooling down (see lib/server/news/imageProviders.ts).
 */
export const searchPexelsImages = async (term: string, page: number, perPage = 30): Promise<PexelsSearchResponse> => {
  if (!env.pexelsApiKey) {
    throw new PexelsConfigurationError();
  }

  const params = new URLSearchParams({
    query: term,
    orientation: "landscape",
    size: "medium",
    page: String(page),
    // Pexels caps per_page at 80; this codebase's shared pagination math
    // (see SEARCH_RESULTS_PER_PAGE in lib/server/news/imageProviders.ts)
    // stays well under that.
    per_page: String(Math.min(80, Math.max(3, perPage))),
  });

  const response = await httpGetText(`${API_URL}?${params.toString()}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: { Accept: "application/json", Authorization: env.pexelsApiKey },
  });

  if (response.status === 429) {
    // Pexels can also 429 on the search call itself (not just downloads,
    // unlike Pixabay) — surface it as a plain error here; the caller treats
    // any search failure as "exhausted" for this term/provider rather than
    // trying to distinguish rate-limit-during-search from other failures.
    throw new Error("Pexels API request failed with HTTP 429.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Pexels API request failed with HTTP ${response.status}.`);
  }

  const payload = JSON.parse(response.text) as { total_results?: number; photos?: Partial<PexelsImage>[] };
  if (!Array.isArray(payload.photos)) {
    throw new Error("Pexels API returned an invalid response.");
  }

  const totalResults = Number(payload.total_results || 0);

  return {
    total: totalResults,
    totalHits: totalResults,
    hits: payload.photos.filter(
      (hit): hit is PexelsImage =>
        Number.isInteger(hit?.id) &&
        (hit?.id ?? 0) > 0 &&
        typeof hit?.url === "string" &&
        typeof hit?.src?.large === "string" &&
        hit.src.large.startsWith("https://"),
    ),
  };
};
