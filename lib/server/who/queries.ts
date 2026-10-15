import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { RowDataPacket } from "mysql2/promise";
import type { IncomingWhoOutbreakNews } from "@/lib/server/who/types";
import type { WhoDonRow } from "@/lib/tools/globeWatch/whoDonTransform";

/**
 * Upserts a batch of WHO DON articles keyed by article_id — matches
 * who_outbreak_news' UNIQUE KEY in schema.ts. WHO occasionally edits an
 * already-published DON (LastModified changes while DonId stays the same,
 * e.g. the Ebola-Bundibugyo series' repeated re-publications in the fixture),
 * so every column is overwritten on every sync rather than only inserting —
 * same "re-sync always reflects upstream's current state" approach as
 * lib/server/gdacs/queries.ts's upsertGdacsEvents.
 */
export const upsertWhoOutbreakNews = async (
  articles: IncomingWhoOutbreakNews[],
): Promise<{ inserted: number; updated: number }> => {
  if (articles.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    articles,
    `
    INSERT INTO who_outbreak_news
      (article_id, title, publish_date, disease_raw, disease_mapped, country_iso, url,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      publish_date = VALUES(publish_date),
      disease_raw = VALUES(disease_raw),
      disease_mapped = VALUES(disease_mapped),
      country_iso = VALUES(country_iso),
      url = VALUES(url),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (a, now) => [
      a.articleId,
      a.title,
      a.publishDate,
      a.diseaseRaw,
      a.diseaseMapped,
      a.countryIso,
      a.url,
      now,
      now,
      now,
    ],
  );
};

/**
 * Deletes WHO DON articles published more than `retentionDays` ago (AC: 超過
 * 180 天的資料每日清除). Unlike gdacs_events' cleanupEndedGdacsEvents (which
 * only considers *ended* events), every who_outbreak_news row has a
 * publish_date by construction (parseWhoDonItem drops any row it can't
 * parse one for — see sources/who.ts), so there's no "still ongoing, keep
 * regardless of age" exemption needed here. Returns the number of rows
 * removed, for logging.
 */
export const cleanupOldWhoOutbreakNews = async (retentionDays = 180): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM who_outbreak_news WHERE publish_date < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

/**
 * Issue #597 (parent #583) — the first read path for who_outbreak_news.
 * #596 shipped the sync/cleanup pipeline only ("Backend-only... no UI in
 * this ticket" per that PR's own description); this feeds the epidemics
 * item's WHO-pin overlay via /api/who/outbreak-news. Ordered newest-first
 * and capped at `limit` (default comfortably above what a 180-day retention
 * window + "a few DONs a week" cadence ever holds) — the globe only ever
 * needs "every currently-retained row," not a paginated feed.
 */
export const getRecentWhoOutbreakNews = async (limit = 500): Promise<WhoDonRow[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT article_id, title, publish_date, disease_raw, disease_mapped, country_iso, url
       FROM who_outbreak_news
       ORDER BY publish_date DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({
      articleId: r.article_id,
      title: r.title,
      publishDate: r.publish_date ? new Date(r.publish_date).toISOString() : "",
      diseaseRaw: r.disease_raw,
      diseaseMapped: r.disease_mapped ?? null,
      countryIso: r.country_iso ?? null,
      url: r.url,
    }));
  });
