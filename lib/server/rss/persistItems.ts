import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { EnrichedRssItem } from "@/types/rss";
import {
  toSqlDateTime,
  utcNowSql,
  withTransaction,
} from "@/lib/server/db/mysql";
import { extractLocationFromText } from "@/lib/server/news/geoExtractor";

export interface PersistStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

const dateToSql = (value: Date | null): string | null => {
  if (!value) return null;
  return toSqlDateTime(value);
};

const clearAndInsertAssets = async (
  newsItemId: number,
  assets: EnrichedRssItem["assets"],
  now: string,
  conn: Parameters<Parameters<typeof withTransaction>[0]>[0],
) => {
  await conn.execute("DELETE FROM news_assets WHERE news_item_id = ?", [
    newsItemId,
  ]);

  for (const asset of assets) {
    await conn.execute(
      `
      INSERT INTO news_assets (news_item_id, asset_type, title, url, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        newsItemId,
        asset.assetType,
        asset.title,
        asset.url,
        asset.sortOrder,
        now,
      ],
    );
  }
};

export const persistItems = async (
  items: EnrichedRssItem[],
): Promise<PersistStats> => {
  if (items.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0 };
  }

  return withTransaction(async (conn) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const item of items) {
      const now = utcNowSql();
      // Reuse the transaction's own connection — opening a second one here would
      // deadlock the 8-slot pool once enough transactions run concurrently.
      const loc = await extractLocationFromText(
        item.title,
        item.detailText || item.descriptionText,
        false,
        conn,
      ).catch(() => null);

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

      // INSERT .. ON DUPLICATE KEY UPDATE rather than a separate SELECT-then-
      // branch, so a duplicate (source_name, feed_code, external_id) within
      // the same batch — e.g. a feed that transiently lists the same article
      // twice — safely upserts instead of throwing ER_DUP_ENTRY and failing
      // the whole ingestion run. `id = LAST_INSERT_ID(id)` is the standard
      // idiom for getting the existing row's id back out of insertId on the
      // update path, same as a fresh insert.
      const [upsertResult] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO news_items (
          source_name, feed_code, feed_name, external_id, canonical_url, source_url,
          title, description_html, description_text, detail_html, detail_text,
          dept_name, category_raw, display_type, published_at_utc,
          public_begin_at_taipei, public_end_at_taipei,
          meta_title, meta_description, keywords, geo_summary,
          lat, lng, location_name, facility_id,
          payload_hash, first_seen_at_utc, last_seen_at_utc, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          feed_name = VALUES(feed_name),
          canonical_url = VALUES(canonical_url),
          source_url = VALUES(source_url),
          title = VALUES(title),
          description_html = VALUES(description_html),
          description_text = VALUES(description_text),
          detail_html = VALUES(detail_html),
          detail_text = VALUES(detail_text),
          dept_name = VALUES(dept_name),
          category_raw = VALUES(category_raw),
          display_type = VALUES(display_type),
          published_at_utc = VALUES(published_at_utc),
          public_begin_at_taipei = VALUES(public_begin_at_taipei),
          public_end_at_taipei = VALUES(public_end_at_taipei),
          meta_title = VALUES(meta_title),
          meta_description = VALUES(meta_description),
          keywords = VALUES(keywords),
          geo_summary = VALUES(geo_summary),
          lat = COALESCE(news_items.lat, VALUES(lat)),
          lng = COALESCE(news_items.lng, VALUES(lng)),
          location_name = COALESCE(news_items.location_name, VALUES(location_name)),
          facility_id = COALESCE(news_items.facility_id, VALUES(facility_id)),
          payload_hash = VALUES(payload_hash),
          last_seen_at_utc = VALUES(last_seen_at_utc),
          updated_at = VALUES(updated_at)
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
          item.metaTitle,
          item.metaDescription,
          item.keywords,
          item.geoSummary,
          loc?.lat ?? null,
          loc?.lng ?? null,
          loc?.locationName ?? null,
          loc?.facilityId ?? null,
          item.payloadHash,
          now,
          now,
          now,
          now,
        ],
      );

      await clearAndInsertAssets(upsertResult.insertId, item.assets, now, conn);

      if (!existing) {
        inserted += 1;
      } else if (existing.payload_hash !== item.payloadHash) {
        updated += 1;
      } else {
        unchanged += 1;
      }
    }

    return { inserted, updated, unchanged };
  });
};
