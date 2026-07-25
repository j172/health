import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { EnrichedRssItem } from "@/types/rss";
import { utcNowSql, withTransaction } from "@/lib/server/db/mysql";

export interface PersistStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

const dateToSql = (value: Date | null): string | null => {
  if (!value) return null;
  return value.toISOString().slice(0, 19).replace("T", " ");
};

const clearAndInsertAssets = async (newsItemId: number, assets: EnrichedRssItem["assets"], now: string, conn: Parameters<Parameters<typeof withTransaction>[0]>[0]) => {
  await conn.execute("DELETE FROM news_assets WHERE news_item_id = ?", [newsItemId]);

  for (const asset of assets) {
    await conn.execute(
      `
      INSERT INTO news_assets (news_item_id, asset_type, title, url, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [newsItemId, asset.assetType, asset.title, asset.url, asset.sortOrder, now],
    );
  }
};

export const persistItems = async (items: EnrichedRssItem[]): Promise<PersistStats> => {
  if (items.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0 };
  }

  return withTransaction(async (conn) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const item of items) {
      const now = utcNowSql();
      const [existingRows] = await conn.execute<RowDataPacket[]>(
        `
        SELECT id, payload_hash
        FROM news_items
        WHERE source_name = ? AND feed_code = ? AND external_id = ?
        LIMIT 1
        `,
        [item.sourceName, item.feedCode, item.externalId],
      );

      const existing = existingRows[0];

      if (!existing) {
        const [insertResult] = await conn.execute<ResultSetHeader>(
          `
          INSERT INTO news_items (
            source_name, feed_code, feed_name, external_id, canonical_url, source_url,
            title, description_html, description_text, detail_html, detail_text,
            dept_name, category_raw, display_type, published_at_utc,
            public_begin_at_taipei, public_end_at_taipei,
            payload_hash, first_seen_at_utc, last_seen_at_utc, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            item.sourceName,
            item.feedCode,
            item.feedName,
            item.externalId,
            item.canonicalUrl,
            item.sourceUrl,
            item.title,
            item.descriptionHtml,
            item.descriptionText,
            item.detailHtml,
            item.detailText,
            item.deptName,
            item.categoryRaw,
            item.displayType,
            dateToSql(item.publishedAtUtc),
            dateToSql(item.publicBeginAtTaipei),
            dateToSql(item.publicEndAtTaipei),
            item.payloadHash,
            now,
            now,
            now,
            now,
          ],
        );

        inserted += 1;
        await clearAndInsertAssets(insertResult.insertId, item.assets, now, conn);
      } else {
        const hasChange = existing.payload_hash !== item.payloadHash;

        await conn.execute(
          `
          UPDATE news_items
          SET feed_name = ?, canonical_url = ?, source_url = ?, title = ?,
              description_html = ?, description_text = ?, detail_html = ?, detail_text = ?,
              dept_name = ?, category_raw = ?, display_type = ?,
              published_at_utc = ?, public_begin_at_taipei = ?, public_end_at_taipei = ?,
              payload_hash = ?, last_seen_at_utc = ?, updated_at = ?
          WHERE id = ?
          `,
          [
            item.feedName,
            item.canonicalUrl,
            item.sourceUrl,
            item.title,
            item.descriptionHtml,
            item.descriptionText,
            item.detailHtml,
            item.detailText,
            item.deptName,
            item.categoryRaw,
            item.displayType,
            dateToSql(item.publishedAtUtc),
            dateToSql(item.publicBeginAtTaipei),
            dateToSql(item.publicEndAtTaipei),
            item.payloadHash,
            now,
            now,
            existing.id,
          ],
        );

        await clearAndInsertAssets(existing.id, item.assets, now, conn);

        if (hasChange) {
          updated += 1;
        } else {
          unchanged += 1;
        }
      }
    }

    return { inserted, updated, unchanged };
  });
};