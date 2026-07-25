import "server-only";
import type { ResultSetHeader } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

/**
 * Clears the stored payload_hash for the given feed codes so the next
 * ingestion run treats every one of their items as changed and re-fetches/
 * re-enriches them, instead of skipping via the unchanged-hash fast path.
 * Needed after fixing an extraction bug (detail_html/assets), since the
 * hash is computed from RSS metadata alone and won't reflect an extraction
 * fix — items already stored keep looking "unchanged" forever otherwise.
 */
export const invalidatePayloadHashesForFeeds = async (feedCodes: string[]): Promise<number> =>
  withConnection(async (conn) => {
    if (feedCodes.length === 0) return 0;
    const placeholders = feedCodes.map(() => "?").join(",");
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE news_items SET payload_hash = '' WHERE feed_code IN (${placeholders})`,
      feedCodes,
    );
    return result.affectedRows;
  });

/**
 * Directly clears stored detail_html/detail_text (and any scraped image
 * assets) for the given feed codes, bypassing ingestion entirely. Sources
 * that publish frequently (e.g. ltn.com.tw) cycle articles out of their live
 * RSS window quickly, so an older article's payload_hash can be invalidated
 * without ingestion ever revisiting it to pick up the change — it's simply
 * no longer present in the feed being fetched. Used when switching a feed to
 * skipDetailFetch after it had already scraped bad detail_html/assets.
 */
export const clearDetailContentForFeeds = async (feedCodes: string[]): Promise<{ itemsCleared: number; assetsDeleted: number }> =>
  withConnection(async (conn) => {
    if (feedCodes.length === 0) return { itemsCleared: 0, assetsDeleted: 0 };
    const placeholders = feedCodes.map(() => "?").join(",");

    const [itemsResult] = await conn.execute<ResultSetHeader>(
      `UPDATE news_items SET detail_html = NULL, detail_text = NULL WHERE feed_code IN (${placeholders})`,
      feedCodes,
    );

    const [assetsResult] = await conn.execute<ResultSetHeader>(
      `DELETE a FROM news_assets a JOIN news_items n ON n.id = a.news_item_id WHERE n.feed_code IN (${placeholders}) AND a.asset_type = 'image'`,
      feedCodes,
    );

    return { itemsCleared: itemsResult.affectedRows, assetsDeleted: assetsResult.affectedRows };
  });
