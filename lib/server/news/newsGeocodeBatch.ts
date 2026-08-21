import "server-only";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { enrichNewsItemLocation } from "./geoExtractor";

export interface NewsGeocodeBatchSummary {
  scanned: number;
  enriched: number;
  attempted: number;
  skippedLock?: boolean;
}

const BATCH_LIMIT = 20;

/**
 * Runs a batch iteration over un-geocoded news articles.
 */
export async function runNewsGeocodeBatch(limit = BATCH_LIMIT, allowExternalGeocode = true): Promise<NewsGeocodeBatchSummary> {
  const lockResult = await withAdvisoryLock("news_geocode_batch_lock", 2, async (conn) => {
    const [candidateRows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, title, description_text, detail_text
      FROM news_items
      WHERE lat IS NULL AND geocode_attempts < 3
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [limit],
    );

    let enrichedCount = 0;
    for (const row of candidateRows) {
      const id = Number(row.id);
      const title = String(row.title || "");
      const content = String(row.detail_text || row.description_text || "");

      const result = await enrichNewsItemLocation(id, title, content, allowExternalGeocode);
      if (result) {
        enrichedCount += 1;
      }
    }

    return {
      scanned: candidateRows.length,
      enriched: enrichedCount,
      attempted: candidateRows.length,
    };
  });

  if (!lockResult.acquired) {
    return { scanned: 0, enriched: 0, attempted: 0, skippedLock: true };
  }

  return lockResult.result;
}
