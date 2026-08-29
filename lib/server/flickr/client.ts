import "server-only";
import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";

const REQUEST_TIMEOUT_MS = 25_000;

export interface FlickrImage {
  id: string;
  title: string;
  author: string;
  link: string;
  mediaUrl: string;
  width?: number;
  height?: number;
}

export interface FlickrSearchResponse {
  total: number;
  totalHits: number;
  hits: FlickrImage[];
}

export class FlickrRateLimitError extends Error {
  constructor() {
    super("Flickr API request failed with HTTP 429/403 (rate limited).");
    this.name = "FlickrRateLimitError";
  }
}

/**
 * Flickr Image Search / Public Feed Adapter.
 * Supports public CC-licensed photo feed and REST search API.
 */
export const searchFlickrImages = async (
  term: string,
  page: number,
  perPage = 30,
): Promise<FlickrSearchResponse> => {
  try {
    // 1. Try public tag feed first (works without API key for open web exploration)
    const encodedTerm = encodeURIComponent(term);
    const feedUrl = `https://www.flickr.com/services/feeds/photos_public.gne?tags=${encodedTerm}&tagmode=any&format=json&nojsoncallback=1`;

    const response = await httpGetText(feedUrl, {
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; HealthzBot/1.0; +https://health.j172.tw)",
      },
    });

    if (response.status === 429 || response.status === 403) {
      throw new FlickrRateLimitError();
    }
    if (response.status < 200 || response.status >= 300) {
      return { total: 0, totalHits: 0, hits: [] };
    }

    // Clean JSON response if Flickr wraps anything
    let jsonText = response.text.trim();
    if (jsonText.startsWith("jsonFlickrFeed(")) {
      jsonText = jsonText.slice(15, -1);
    }

    const payload = JSON.parse(jsonText) as {
      items?: Array<{
        title: string;
        link: string;
        media?: { m: string };
        author: string;
        author_id: string;
      }>;
    };

    if (!Array.isArray(payload.items)) {
      return { total: 0, totalHits: 0, hits: [] };
    }

    const hits: FlickrImage[] = payload.items
      .filter((item) => item.media?.m && item.link)
      .map((item, idx) => {
        // Replace _m.jpg with _b.jpg (1024px large version)
        const mediaUrl = item.media!.m.replace(/_m\.(jpg|jpeg|png)$/i, "_b.$1");
        return {
          id: `flickr-${item.author_id || "public"}-${page}-${idx}-${Date.now()}`,
          title: item.title || "Flickr Image",
          author: item.author?.replace(/nobody@flickr.com \("([^"]+)"\)/, "$1") || item.author || "Flickr Contributor",
          link: item.link,
          mediaUrl,
          width: 1024,
          height: 680,
        };
      });

    return {
      total: hits.length,
      totalHits: hits.length,
      hits: hits.slice(0, perPage),
    };
  } catch (error) {
    if (error instanceof FlickrRateLimitError) throw error;
    console.warn("[flickr] Search error (non-fatal):", error instanceof Error ? error.message : String(error));
    return { total: 0, totalHits: 0, hits: [] };
  }
};

