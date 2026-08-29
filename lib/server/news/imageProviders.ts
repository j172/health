import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { utcNowSql } from "@/lib/server/db/mysql";
import { env } from "@/lib/server/config/env";
import { searchHealthImages, type PixabayImage } from "@/lib/server/pixabay/client";
import { downloadPixabayImage, removeDownloadedImage as removePixabayImage, PixabayRateLimitError } from "@/lib/server/pixabay/download";
import { searchPexelsImages, type PexelsImage } from "@/lib/server/pexels/client";
import { downloadPexelsImage, removeDownloadedImage as removePexelsImage, PexelsRateLimitError } from "@/lib/server/pexels/download";
import { searchUnsplashImages, type UnsplashImage } from "@/lib/server/unsplash/client";
import { downloadUnsplashImage, removeDownloadedImage as removeUnsplashImage, UnsplashRateLimitError } from "@/lib/server/unsplash/download";
import { searchFlickrImages, type FlickrImage, FlickrRateLimitError } from "@/lib/server/flickr/client";
import { downloadFlickrImage, removeDownloadedImage as removeFlickrImage } from "@/lib/server/flickr/download";

export type ProviderName = "pixabay" | "pexels" | "unsplash" | "flickr";

// Shared per-page size for search pagination math in cardImages.ts. Each
// provider's own client clamps this down further to its own API max
// (Pixabay 200, Pexels 80, Unsplash 30) — 30 stays under all three.
export const SEARCH_RESULTS_PER_PAGE = 30;

export interface ProviderImage {
  provider: ProviderName;
  /** Canonical string form of the provider's own image id (news_card_images.provider_image_id). */
  id: string;
  pageURL: string;
  contributorName: string | null;
  width: number;
  height: number;
  /**
   * The provider-specific search hit (PixabayImage/PexelsImage/UnsplashImage)
   * that download() needs — carried on the candidate itself, scoped to the
   * lifetime of one loadCandidatesForTerm→download sequence in
   * cardImages.ts, rather than kept in any provider-adapter-level cache.
   * This app is a long-running in-process cron (restarts only on deploy, see
   * lib/server/cron/registerJobs.ts), so a module-level id→payload map would
   * grow for as long as the process stays up with nothing ever evicting old
   * entries — a real risk on this host given its documented history of LVE
   * memory-limit incidents. Each adapter casts this back to its own concrete
   * type in download() below.
   */
  raw: unknown;
}

export interface DownloadedProviderImage {
  absolutePath: string;
  localPath: string;
  contentSha256: string;
  width: number;
  height: number;
}

export interface ImageProviderSearchResult {
  candidates: ProviderImage[];
  totalHits: number;
}

export interface ImageProvider {
  name: ProviderName;
  /** Whether this provider's API key(s) are present — unconfigured providers are silently skipped, not treated as failures. */
  isConfigured(): boolean;
  search(conn: PoolConnection, term: string, page: number): Promise<ImageProviderSearchResult>;
  download(candidate: ProviderImage): Promise<DownloadedProviderImage>;
  remove(absolutePath: string): Promise<void>;
}

/** Thrown by ImageProvider.download() on HTTP 429, wrapping each provider's own *RateLimitError class into one type cardImages.ts can check uniformly. */
export class ProviderRateLimitError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`${provider} image download was rate-limited (HTTP 429).`);
    this.name = "ProviderRateLimitError";
  }
}

interface CacheRow extends RowDataPacket {
  response_json: string;
}

const CACHE_TTL_HOURS = 24;

// ─── Pixabay adapter ────────────────────────────────────────────────────────
// Reuses the exact existing cache table/key format (pixabay_api_cache) so
// this refactor doesn't change Pixabay's own caching behavior at all.

const pixabayAdapter: ImageProvider = {
  name: "pixabay",
  isConfigured: () => Boolean(env.pixabayApiKey),
  search: async (conn, term, page) => {
    const cacheKey = `health-horizontal-photo-safe-v2-${term}-per-${SEARCH_RESULTS_PER_PAGE}-page-${page}`;
    const [cachedRows] = await conn.execute<CacheRow[]>(
      `
      SELECT response_json
      FROM pixabay_api_cache
      WHERE cache_key = ?
        AND fetched_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
      LIMIT 1
      `,
      [cacheKey, CACHE_TTL_HOURS],
    );

    let hits: PixabayImage[];
    let totalHits: number;
    if (cachedRows[0]) {
      try {
        const parsed = JSON.parse(cachedRows[0].response_json) as { hits: PixabayImage[]; totalHits: number };
        hits = parsed.hits;
        totalHits = parsed.totalHits;
      } catch {
        await conn.execute("DELETE FROM pixabay_api_cache WHERE cache_key = ?", [cacheKey]);
        const fresh = await searchHealthImages(term, page, SEARCH_RESULTS_PER_PAGE);
        hits = fresh.hits;
        totalHits = fresh.totalHits;
        await conn.execute(
          "INSERT INTO pixabay_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
          [cacheKey, JSON.stringify(fresh), utcNowSql()],
        );
      }
    } else {
      const fresh = await searchHealthImages(term, page, SEARCH_RESULTS_PER_PAGE);
      hits = fresh.hits;
      totalHits = fresh.totalHits;
      await conn.execute(
        "INSERT INTO pixabay_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
        [cacheKey, JSON.stringify({ total: totalHits, totalHits, hits }), utcNowSql()],
      );
    }

    const candidates: ProviderImage[] = hits.map((hit) => ({
      provider: "pixabay",
      id: String(hit.id),
      pageURL: hit.pageURL,
      contributorName: hit.user || null,
      width: hit.imageWidth || hit.webformatWidth,
      height: hit.imageHeight || hit.webformatHeight,
      raw: hit,
    }));
    return { candidates, totalHits };
  },
  download: async (candidate) => {
    try {
      return await downloadPixabayImage(candidate.raw as PixabayImage);
    } catch (error) {
      if (error instanceof PixabayRateLimitError) throw new ProviderRateLimitError("pixabay");
      throw error;
    }
  },
  remove: removePixabayImage,
};

// ─── Pexels adapter ─────────────────────────────────────────────────────────
// Uses the new generalized provider_api_cache table (see schema.ts) rather
// than a second Pixabay-shaped single-provider table.

const pexelsAdapter: ImageProvider = {
  name: "pexels",
  isConfigured: () => Boolean(env.pexelsApiKey),
  search: async (conn, term, page) => {
    const cacheKey = `pexels-health-v1-${term}-per-${SEARCH_RESULTS_PER_PAGE}-page-${page}`;
    const [cachedRows] = await conn.execute<CacheRow[]>(
      `
      SELECT response_json
      FROM provider_api_cache
      WHERE cache_key = ?
        AND fetched_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
      LIMIT 1
      `,
      [cacheKey, CACHE_TTL_HOURS],
    );

    let hits: PexelsImage[];
    let totalHits: number;
    if (cachedRows[0]) {
      try {
        const parsed = JSON.parse(cachedRows[0].response_json) as { hits: PexelsImage[]; totalHits: number };
        hits = parsed.hits;
        totalHits = parsed.totalHits;
      } catch {
        await conn.execute("DELETE FROM provider_api_cache WHERE cache_key = ?", [cacheKey]);
        const fresh = await searchPexelsImages(term, page, SEARCH_RESULTS_PER_PAGE);
        hits = fresh.hits;
        totalHits = fresh.totalHits;
        await conn.execute(
          "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
          [cacheKey, JSON.stringify(fresh), utcNowSql()],
        );
      }
    } else {
      const fresh = await searchPexelsImages(term, page, SEARCH_RESULTS_PER_PAGE);
      hits = fresh.hits;
      totalHits = fresh.totalHits;
      await conn.execute(
        "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
        [cacheKey, JSON.stringify({ total: totalHits, totalHits, hits }), utcNowSql()],
      );
    }

    const candidates: ProviderImage[] = hits.map((hit) => ({
      provider: "pexels",
      id: String(hit.id),
      pageURL: hit.url,
      contributorName: hit.photographer || null,
      width: hit.width,
      height: hit.height,
      raw: hit,
    }));
    return { candidates, totalHits };
  },
  download: async (candidate) => {
    try {
      return await downloadPexelsImage(candidate.raw as PexelsImage);
    } catch (error) {
      if (error instanceof PexelsRateLimitError) throw new ProviderRateLimitError("pexels");
      throw error;
    }
  },
  remove: removePexelsImage,
};

// ─── Unsplash adapter ───────────────────────────────────────────────────────

/** Extracted from the adapter's `search` so the rate-limit conversion below
 * has one call site to wrap, regardless of which internal branch (cache-miss
 * vs invalid-cache-JSON-refetch) actually made the network call. */
const unsplashSearch = async (
  conn: PoolConnection,
  term: string,
  page: number,
): Promise<{ candidates: ProviderImage[]; totalHits: number }> => {
  const cacheKey = `unsplash-health-v1-${term}-per-${SEARCH_RESULTS_PER_PAGE}-page-${page}`;
  const [cachedRows] = await conn.execute<CacheRow[]>(
    `
    SELECT response_json
    FROM provider_api_cache
    WHERE cache_key = ?
      AND fetched_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
    LIMIT 1
    `,
    [cacheKey, CACHE_TTL_HOURS],
  );

  let hits: UnsplashImage[];
  let totalHits: number;
  if (cachedRows[0]) {
    try {
      const parsed = JSON.parse(cachedRows[0].response_json) as { hits: UnsplashImage[]; totalHits: number };
      hits = parsed.hits;
      totalHits = parsed.totalHits;
    } catch {
      await conn.execute("DELETE FROM provider_api_cache WHERE cache_key = ?", [cacheKey]);
      const fresh = await searchUnsplashImages(term, page, SEARCH_RESULTS_PER_PAGE);
      hits = fresh.hits;
      totalHits = fresh.totalHits;
      await conn.execute(
        "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
        [cacheKey, JSON.stringify(fresh), utcNowSql()],
      );
    }
  } else {
    const fresh = await searchUnsplashImages(term, page, SEARCH_RESULTS_PER_PAGE);
    hits = fresh.hits;
    totalHits = fresh.totalHits;
    await conn.execute(
      "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
      [cacheKey, JSON.stringify({ total: totalHits, totalHits, hits }), utcNowSql()],
    );
  }

  const candidates: ProviderImage[] = hits.map((hit) => ({
    provider: "unsplash",
    id: hit.id,
    pageURL: hit.links.html,
    contributorName: hit.user?.name || null,
    width: hit.width,
    height: hit.height,
    raw: hit,
  }));
  return { candidates, totalHits };
};

const unsplashAdapter: ImageProvider = {
  name: "unsplash",
  isConfigured: () => Boolean(env.unsplash.accessKey),
  search: async (conn, term, page) => {
    // Unsplash's demo-tier rate limit surfaces as HTTP 403 on the search
    // call itself (see client.ts's searchUnsplashImages) — without this
    // conversion, cardImages.ts's orchestration loop would treat it as an
    // ordinary per-term failure instead of engaging the same
    // cooldown/backoff Pixabay 429s already get (providerCooldown.ts).
    try {
      return await unsplashSearch(conn, term, page);
    } catch (error) {
      if (error instanceof UnsplashRateLimitError) throw new ProviderRateLimitError("unsplash");
      throw error;
    }
  },
  download: async (candidate) => {
    try {
      return await downloadUnsplashImage(candidate.raw as UnsplashImage);
    } catch (error) {
      if (error instanceof UnsplashRateLimitError) throw new ProviderRateLimitError("unsplash");
      throw error;
    }
  },
  remove: removeUnsplashImage,
};

// ─── Flickr adapter ─────────────────────────────────────────────────────────

const flickrSearch = async (
  conn: PoolConnection,
  term: string,
  page: number,
): Promise<{ candidates: ProviderImage[]; totalHits: number }> => {
  const cacheKey = `flickr-health-v1-${term}-per-${SEARCH_RESULTS_PER_PAGE}-page-${page}`;
  const [cachedRows] = await conn.execute<CacheRow[]>(
    `
    SELECT response_json
    FROM provider_api_cache
    WHERE cache_key = ?
      AND fetched_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
    LIMIT 1
    `,
    [cacheKey, CACHE_TTL_HOURS],
  );

  let hits: FlickrImage[];
  let totalHits: number;
  if (cachedRows[0]) {
    try {
      const parsed = JSON.parse(cachedRows[0].response_json) as { hits: FlickrImage[]; totalHits: number };
      hits = parsed.hits;
      totalHits = parsed.totalHits;
    } catch {
      await conn.execute("DELETE FROM provider_api_cache WHERE cache_key = ?", [cacheKey]);
      const fresh = await searchFlickrImages(term, page, SEARCH_RESULTS_PER_PAGE);
      hits = fresh.hits;
      totalHits = fresh.totalHits;
      await conn.execute(
        "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
        [cacheKey, JSON.stringify(fresh), utcNowSql()],
      );
    }
  } else {
    const fresh = await searchFlickrImages(term, page, SEARCH_RESULTS_PER_PAGE);
    hits = fresh.hits;
    totalHits = fresh.totalHits;
    await conn.execute(
      "INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at_utc = VALUES(fetched_at_utc)",
      [cacheKey, JSON.stringify({ total: totalHits, totalHits, hits }), utcNowSql()],
    );
  }

  const candidates: ProviderImage[] = hits.map((hit) => ({
    provider: "flickr",
    id: hit.id,
    pageURL: hit.link,
    contributorName: hit.author || null,
    width: hit.width || 1024,
    height: hit.height || 680,
    raw: hit,
  }));
  return { candidates, totalHits };
};

const flickrAdapter: ImageProvider = {
  name: "flickr",
  isConfigured: () => true,
  search: async (conn, term, page) => {
    try {
      return await flickrSearch(conn, term, page);
    } catch (error) {
      if (error instanceof FlickrRateLimitError) throw new ProviderRateLimitError("flickr");
      throw error;
    }
  },
  download: async (candidate) => {
    try {
      return await downloadFlickrImage(candidate.raw as FlickrImage);
    } catch (error) {
      if (error instanceof FlickrRateLimitError) throw new ProviderRateLimitError("flickr");
      throw error;
    }
  },
  remove: removeFlickrImage,
};

/** Fixed fallback order: Pixabay -> Pexels -> Unsplash -> Flickr */
export const IMAGE_PROVIDERS: ImageProvider[] = [
  pixabayAdapter,
  pexelsAdapter,
  unsplashAdapter,
  flickrAdapter,
];
