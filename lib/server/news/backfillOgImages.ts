import "server-only";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import {
  getMysqlPool,
  ensureSchema,
  utcNowSql,
  withConnection,
} from "@/lib/server/db/mysql";
import { fetchOpenGraphImageAsset } from "@/lib/server/images/fetchOpenGraphImage";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";

const LOCK_NAME = "news_og_image_backfill_lock";

interface MissingOgRow extends RowDataPacket {
  id: number;
  canonical_url: string;
  title: string;
  source_name: string;
}

export interface MissingCardImageTarget {
  id: number;
  canonical_url: string;
  title: string;
  source_name: string;
}

export interface OgImageBackfillSummary {
  assigned: number;
  failed: number;
  skipped: number;
  locked: boolean;
  reason: string | null;
  errors: string[];
}

const MISSING_WHERE = `
  c.news_item_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM news_assets a
    WHERE a.news_item_id = n.id AND a.asset_type = 'image'
  )
  AND n.canonical_url IS NOT NULL
  AND n.canonical_url NOT LIKE '%news.google.com%'
`;

/** Targets for external OG workers (GHA runner) that can fetch HTML off-host. */
export const listMissingCardImageTargets = async (
  requestedLimit = 20,
): Promise<MissingCardImageTarget[]> => {
  const limit = Math.min(50, Math.max(1, Math.trunc(requestedLimit)));
  await ensureSchema();
  return withConnection(async (conn) => {
    const [rows] = await conn.execute<MissingOgRow[]>(
      `
      SELECT n.id, n.canonical_url, n.title, n.source_name
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE ${MISSING_WHERE}
      ORDER BY n.image_backfill_attempts ASC, COALESCE(n.published_at_utc, n.created_at) DESC, n.id DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      canonical_url: String(row.canonical_url),
      title: String(row.title),
      source_name: String(row.source_name),
    }));
  });
};

/**
 * Attach a card image after an external worker resolved og:image (or any
 * direct image URL). Server re-hosts via downloadArticleImage — CDN hosts
 * often allow the shared-host IP even when article HTML returns 403.
 */
export const attachCardImageFromUrl = async (
  newsItemId: number,
  imageUrl: string,
  title: string | null = null,
): Promise<{ ok: boolean; localPath?: string; reason?: string }> => {
  const id = Math.trunc(newsItemId);
  if (!Number.isFinite(id) || id < 1)
    return { ok: false, reason: "invalid newsItemId" };
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl))
    return { ok: false, reason: "invalid imageUrl" };
  if (/news\.google\.com/i.test(imageUrl))
    return { ok: false, reason: "google news url not allowed" };

  await ensureSchema();
  const conn = await getMysqlPool().getConnection();
  try {
    if (await alreadyHasImage(conn, id)) {
      return { ok: false, reason: "already has image" };
    }

    const localPath = await downloadArticleImage(imageUrl);
    if (!localPath) return { ok: false, reason: "download failed validation" };

    const now = utcNowSql();
    const [insertResult] = await conn.execute<ResultSetHeader>(
      `
      INSERT INTO news_assets (news_item_id, asset_type, title, url, sort_order, created_at)
      SELECT ?, 'image', ?, ?, 0, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM news_assets a
        WHERE a.news_item_id = ? AND a.asset_type = 'image'
      )
      `,
      [id, title, localPath, now, id],
    );

    if (insertResult.affectedRows !== 1) {
      return { ok: false, reason: "insert skipped (race)" };
    }
    return { ok: true, localPath };
  } finally {
    conn.release();
  }
};

/**
 * For articles that have neither a Pixabay card image nor any news_assets
 * image (typical of skipDetailFetch feeds like ltn before OG support), fetch
 * og:image from the canonical URL and store it as a local news_assets row.
 * Does not rewrite detail_html / payload_hash — image-only repair.
 *
 * Note: shared-host egress is blocked by some publishers (ltn 403). Prefer
 * the GHA external worker (list + attach) for those sources.
 */
export const backfillMissingImagesFromOpenGraph = async (
  requestedLimit = 20,
): Promise<OgImageBackfillSummary> => {
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
    const [lockRows] = await conn.query<RowDataPacket[]>(
      "SELECT GET_LOCK(?, 1) AS ok",
      [LOCK_NAME],
    );
    gotLock = lockRows[0]?.ok === 1;
    if (!gotLock) {
      summary.locked = true;
      summary.reason = "Another OG image backfill is running.";
      return summary;
    }

    const [missingRows] = await conn.execute<MissingOgRow[]>(
      `
      SELECT n.id, n.canonical_url, n.title, n.source_name
      FROM news_items n
      LEFT JOIN news_card_images c ON c.news_item_id = n.id
      WHERE ${MISSING_WHERE}
      ORDER BY n.image_backfill_attempts ASC, COALESCE(n.published_at_utc, n.created_at) DESC, n.id DESC
      LIMIT ?
      `,
      [limit],
    );

    if (missingRows.length === 0) {
      summary.reason =
        "No news items are missing both RSS and Pixabay card images.";
      return summary;
    }

    for (const news of missingRows) {
      try {
        if (await alreadyHasImage(conn, news.id)) {
          summary.skipped += 1;
          continue;
        }

        const asset = await fetchOpenGraphImageAsset(news.canonical_url);
        if (!asset) {
          summary.failed += 1;
          if (summary.errors.length < 10) {
            summary.errors.push(
              `news ${news.id}: og fetch empty (${news.source_name})`,
            );
          }
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
        const message =
          error instanceof Error ? error.message : "Unknown OG backfill error";
        if (summary.errors.length < 10)
          summary.errors.push(`news ${news.id}: ${message}`);
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

const alreadyHasImage = async (
  conn: PoolConnection,
  newsId: number,
): Promise<boolean> => {
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
