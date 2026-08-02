import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool, ensureSchema, utcNowSql } from "@/lib/server/db/mysql";
import { fetchOpenGraphImageAsset } from "@/lib/server/images/fetchOpenGraphImage";

const LOCK_NAME = "news_og_image_backfill_lock";

interface MissingOgRow extends RowDataPacket {
  id: number;
  canonical_url: string;
  title: string;
}

export interface OgImageBackfillSummary {
  assigned: number;
  failed: number;
  skipped: number;
  locked: boolean;
  reason: string | null;
  errors: string[];
}

/**
 * For articles that have neither a Pixabay card image nor any news_assets
 * image (typical of skipDetailFetch feeds like ltn before OG support), fetch
 * og:image from the canonical URL and store it as a local news_assets row.
 * Does not rewrite detail_html / payload_hash — image-only repair.
 */
export const backfillMissingImagesFromOpenGraph = async (requestedLimit = 20): Promise<OgImageBackfillSummary> => {
  const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit)));
  const summary: OgImageBackfillSummary = {
    assigned: 0,
    failed: 0,
    skipped: 0,
    locked: false,
    reason: null,
    errors: [],
  };

  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  let gotLock = false;

  try {
    const [lockRows] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 1) AS ok", [LOCK_NAME]);
    gotLock = lockRows[0]?.ok === 1;
    if (!gotLock) {
      summary.locked = true;
      summary.reason = "Another OG image backfill is running.";
      return summary;
    }

    const [missingRows] = await conn.execute<MissingOgRow[]>(
      `
      SELECT n.id, n.canonical_url, n.title
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE c.news_item_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM news_assets a
          WHERE a.news_item_id = n.id AND a.asset_type = 'image'
        )
        AND n.canonical_url IS NOT NULL
        AND n.canonical_url NOT LIKE '%news.google.com%'
      ORDER BY n.image_backfill_attempts ASC, COALESCE(n.published_at_utc, n.created_at) DESC, n.id DESC
      LIMIT ?
      `,
      [limit],
    );

    if (missingRows.length === 0) {
      summary.reason = "No news items are missing both RSS and Pixabay card images.";
      return summary;
    }

    for (const news of missingRows) {
      try {
        // Re-check under lock so concurrent workers don't double-insert.
        if (await alreadyHasImage(conn, news.id)) {
          summary.skipped += 1;
          continue;
        }

        const asset = await fetchOpenGraphImageAsset(news.canonical_url);
        if (!asset) {
          summary.failed += 1;
          await conn.execute(
            "UPDATE news_items SET image_backfill_attempts = image_backfill_attempts + 1 WHERE id = ?",
            [news.id],
          );
          continue;
        }

        const now = utcNowSql();
        const [insertResult] = await conn.execute<ResultSetHeader>(
          `
          INSERT INTO news_assets (news_item_id, asset_type, title, url, sort_order, created_at)
          SELECT ?, 'image', ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM news_assets a
            WHERE a.news_item_id = ? AND a.asset_type = 'image'
          )
          `,
          [news.id, asset.title, asset.url, asset.sortOrder, now, news.id],
        );

        if (insertResult.affectedRows === 1) {
          summary.assigned += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : "Unknown OG backfill error";
        if (summary.errors.length < 10) summary.errors.push(`news ${news.id}: ${message}`);
        await conn.execute(
          "UPDATE news_items SET image_backfill_attempts = image_backfill_attempts + 1 WHERE id = ?",
          [news.id],
        );
      }
    }

    return summary;
  } finally {
    if (gotLock) {
      await conn.query("DO RELEASE_LOCK(?)", [LOCK_NAME]);
    }
    conn.release();
  }
};

const alreadyHasImage = async (conn: PoolConnection, newsId: number): Promise<boolean> => {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `
    SELECT 1 AS ok
    FROM news_items n
    LEFT JOIN news_card_images c ON c.news_item_id = n.id
    WHERE n.id = ?
      AND (
        c.news_item_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM news_assets a
          WHERE a.news_item_id = n.id AND a.asset_type = 'image'
        )
      )
    LIMIT 1
    `,
    [newsId],
  );
  return rows.length > 0;
};
