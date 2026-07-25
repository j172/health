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
