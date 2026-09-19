import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

/**
 * lib/server/rss/duplicateImageDetection.ts
 *
 * Special-source scrapers (fetchExpandedSources.ts and friends) store the
 * remote image URL they scraped off a listing page directly into
 * news_assets — unlike enrichItem()'s RSS path, they're never re-hosted
 * (see persistItems.ts's clearAndInsertAssets). When a listing page's
 * template carries one shared placeholder thumbnail rather than a per-card
 * image (confirmed live for PChome's health category —
 * `article-10bc08be933f8f49fff1a7a1.jpg` on multiple unrelated articles),
 * every article scraped from it silently gets that same URL as its "real"
 * image, indistinguishable from a normal successful scrape.
 *
 * This module gives processSpecialSource() a cheap way to notice that
 * pattern before the item is enriched: same source_name, same image URL,
 * recently used elsewhere — treat it as if scraping had found nothing, so
 * the og:image fallback (fetchOpenGraphImageAsset) gets a chance to find
 * this article's own photo instead of silently accepting the shared one.
 */

/** How many of a source's most recent news_assets image URLs to check against. */
export const RECENT_IMAGE_LOOKBACK = 200;

/**
 * True when `imageUrl` already appears in `recentUrls` — i.e. some other
 * article (already persisted, or already assigned earlier in the same
 * ingestion batch) from the same source recently used this exact URL.
 *
 * Pure/sync and DB-free on purpose: cheap to unit test, and lets callers
 * build `recentUrls` from any combination of sources (DB history, the
 * current in-progress batch, ...).
 */
export const isDuplicateRecentImage = (
  recentUrls: ReadonlySet<string> | readonly string[],
  imageUrl: string | null | undefined,
): boolean => {
  if (!imageUrl) return false;
  const set = recentUrls instanceof Set ? recentUrls : new Set(recentUrls);
  return set.has(imageUrl);
};

/**
 * The most recent image asset URLs already stored for this source, newest
 * first. Bounded by `limit` — this only needs to catch a template-level
 * repeat within a source's recent output, not build an exhaustive history.
 */
export const getRecentImageUrlsForSource = async (
  sourceName: string,
  limit: number = RECENT_IMAGE_LOOKBACK,
): Promise<Set<string>> => {
  if (!sourceName) return new Set();

  return withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT a.url
      FROM news_assets a
      JOIN news_items n ON n.id = a.news_item_id
      WHERE n.source_name = ? AND a.asset_type = 'image'
      ORDER BY n.id DESC
      LIMIT ?
      `,
      [sourceName, limit],
    );
    return new Set(rows.map((row) => String(row.url)));
  });
};
