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
  /**
   * Items whose external_id was not found but whose INSERT still did not create
   * a row — i.e. they collided on the canonical_url unique key instead. A high
   * number means the feed is handing out unstable external_ids.
   */
  externalIdDrift: number;
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
    return { inserted: 0, updated: 0, unchanged: 0, externalIdDrift: 0 };
  }

  return withTransaction(async (conn) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let externalIdDrift = 0;

    for (const item of items) {
      const now = utcNowSql();

      // Identity check first, before any of the expensive work below.
      //
      // The INSERT can collide on either of news_items' unique keys —
      // uq_news_external (source_name, feed_code, external_id) and uq_news_url
      // (source_name, canonical_url) — so both have to be checked. Matching only
      // the first is what made production report ~1374 "inserted" every run while
      // barely any rows were created: the feeds reissue external_ids, so the
      // lookup missed and the INSERT collided on the URL instead.
      //
      // Two separate statements rather than one `OR`, deliberately. uq_news_url
      // is a PREFIX index on canonical_url(255), and MySQL will not index_merge
      // an OR across it — the combined query degrades to a full scan per item,
      // which doubled a 1,470-item run's wall time when it was written that way.
      // Each of these is a single-row index lookup.
      const [byExternalId] = await conn.execute<RowDataPacket[]>(
        `
        SELECT id, payload_hash
        FROM news_items
        WHERE source_name = ? AND feed_code = ? AND external_id = ?
        LIMIT 1
        `,
        [item.sourceName, item.feedCode, item.externalId],
      );

      let existing = byExternalId[0];
      if (!existing) {
        const [byUrl] = await conn.execute<RowDataPacket[]>(
          `
          SELECT id, payload_hash
          FROM news_items
          WHERE source_name = ? AND canonical_url = ?
          LIMIT 1
          `,
          [item.sourceName, item.canonicalUrl],
        );
        existing = byUrl[0];
      }

      // Nothing about this article has changed since we last saw it. Skip the
      // geo extraction, the 30-column upsert, and the delete-and-reinsert of its
      // assets — all three were running for roughly 1,500 unchanged articles on
      // every 30-minute tick, which is the overwhelming majority of the run's
      // work, purely to set last_seen_at_utc and updated_at to `now`.
      //
      // Nothing reads last_seen_at_utc, but it is cheap to keep honest with a
      // two-column touch.
      if (existing && existing.payload_hash === item.payloadHash) {
        await conn.execute(
          "UPDATE news_items SET last_seen_at_utc = ?, updated_at = ? WHERE id = ?",
          [now, now, existing.id],
        );
        unchanged += 1;
        continue;
      }

      // Reuse the transaction's own connection — opening a second one here would
      // deadlock the 8-slot pool once enough transactions run concurrently.
      const loc = await extractLocationFromText(
        item.title,
        item.detailText || item.descriptionText,
        false,
        conn,
      ).catch(() => null);

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

      // Classify on what the database actually did, not on what the pre-SELECT
      // predicted. MySQL's convention for INSERT .. ON DUPLICATE KEY UPDATE is
      // affectedRows 1 = inserted, 2 = updated, 0 = matched but unchanged.
      //
      // The old code counted `!existing` — a miss on the pre-SELECT, which looks
      // up (source_name, feed_code, external_id) only. news_items has a SECOND
      // unique key on (source_name, canonical_url), so a row can be absent under
      // the external_id the feed reports now and still collide on its URL, taking
      // the UPDATE branch. Production was reporting ~1374 "inserted" every single
      // run while the row count barely moved, and inserted+updated+unchanged
      // (1374+1+436=1811) did not even equal fetched (1470).
      //
      // Note affectedRows alone cannot mean "unchanged" here: last_seen_at_utc
      // and updated_at are set to `now` on every upsert, so an existing row
      // always reports 2. Genuinely-unchanged items took the early `continue`
      // above, on a payload_hash comparison, before reaching this statement.
      if (upsertResult.affectedRows === 1) {
        inserted += 1;
      } else {
        updated += 1;
      }

      // The feed handed us an external_id that does not match the row already
      // stored under this URL. The upsert deliberately does not rewrite
      // external_id — that could collide with uq_news_external for a different
      // row — so the stored id stays put and this same item drifts again on
      // every future run. Counted rather than inferred.
      if (!existing) {
        externalIdDrift += 1;
      }
    }

    if (externalIdDrift > 0) {
      console.warn(
        `[persistItems] ${externalIdDrift}/${items.length} items were not found by either unique key yet still did not insert — worth checking for a third identity path.`,
      );
    }

    return { inserted, updated, unchanged, externalIdDrift };
  });
};
