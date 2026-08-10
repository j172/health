import { createHash } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { utcNowSql, withConnection } from "@/lib/server/db/mysql";

export interface WraDroughtAlertRecord {
  reportDate: string; // "YYYY-MM-DD" (WRA's 通報日期, already ISO-shaped)
  alertLevel: string | null; // 預警水情, e.g. "水情稍緊" / "一階限水"
  reservoirName: string; // 水庫名稱
  supplyArea: string | null; // 供水區
  title: string; // 標題
}

// Audit/history table mirroring cwa_alerts's shape (see lib/server/db/schema.ts)
// — the widget itself never reads this, it only reads the news_items rows
// upserted below (see docs/specs/phase5-wra-drought-alerts.md section 2/4).
export const upsertWraDroughtAlerts = (records: WraDroughtAlertRecord[]) =>
  chunkedUpsert(
    records,
    `INSERT INTO wra_drought_alerts
       (reservoir_name, report_date, alert_level, supply_area, title, synced_at, created_at, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       alert_level = VALUES(alert_level),
       supply_area = VALUES(supply_area),
       title = VALUES(title),
       synced_at = VALUES(synced_at),
       updated_at = VALUES(updated_at)`,
    (r, now) => [r.reservoirName, r.reportDate, r.alertLevel, r.supplyArea, r.title, now, now, now],
  );

/**
 * Latest (`通報日期`) row per `水庫名稱` — see
 * docs/specs/phase5-wra-drought-alerts.md section 2. Deliberately no
 * additional recency cutoff on `reportDate` beyond "latest per reservoir":
 * spec section 2 defines the "active set" purely as the latest row per
 * reservoir and relies on the news_items republish/age-out mechanism (48h
 * window, refreshed daily) for currency — not on how old the underlying
 * bulletin itself is. A reservoir whose last bulletin is genuinely years old
 * (e.g. 石門水庫's latest row is from 2024-03-19 in this feed) will still
 * show as "生效中" every day until WRA publishes something newer for it,
 * since the source carries no "restriction lifted" event to key off of. See
 * the PR description for this tradeoff — an experimental date-based cutoff
 * was tried and rejected because, against the live feed, it hid every
 * reservoir including ones updated within the last ~3.5 months.
 */
export const pickLatestPerReservoir = (records: WraDroughtAlertRecord[]): WraDroughtAlertRecord[] => {
  const latest = new Map<string, WraDroughtAlertRecord>();
  for (const r of records) {
    const current = latest.get(r.reservoirName);
    if (!current || r.reportDate > current.reportDate) latest.set(r.reservoirName, r);
  }
  return [...latest.values()];
};

const NEWS_SOURCE_NAME = "wra";
const NEWS_FEED_CODE = "wra";
const NEWS_FEED_NAME = "經濟部水利署－枯旱限水通報";
// No per-bulletin article page exists in this feed, so every synthetic row
// points at the opendata resource itself — see spec section 3.
const WRA_RESOURCE_URL = "https://opendata.wra.gov.tw/api/v2/51ea7202-18fd-46e3-adae-4d05bc827a28?sort=_importdate%20asc&format=JSON";

// Reservoir names aren't ASCII/URL-safe (and one, "地下水(集集堰、日月潭水庫)",
// percent-encodes to well over external_id's VARCHAR(100)), so external_id is
// a content hash rather than a literal slug — same "hash the raw field for a
// stable key" reasoning as cwa_alerts.alert_key / tfda_drug_ingredients.row_key.
const reservoirExternalId = (reservoirName: string): string => createHash("sha256").update(reservoirName).digest("hex");

const payloadHashOf = (r: WraDroughtAlertRecord): string =>
  createHash("sha256").update(`${r.reservoirName}|${r.reportDate}|${r.alertLevel ?? ""}|${r.title}`).digest("hex");

const describeBulletin = (r: WraDroughtAlertRecord): string => {
  const parts = [
    r.alertLevel ? `預警水情：${r.alertLevel}` : null,
    r.supplyArea ? `供水區：${r.supplyArea}` : null,
    `通報日期：${r.reportDate}`,
  ].filter(Boolean);
  return `<p>${parts.join("　")}</p>`;
};

/**
 * Upserts one news_items row per reservoir's latest bulletin, with
 * published_at_utc bumped to *now* on every call regardless of whether
 * the content changed — the same "keep refreshing while still current"
 * mechanism CWA's warnings feed relies on (see
 * lib/server/news/queries.ts's listActiveWeatherWarnings): a reservoir that
 * drops out of `records` (superseded, or the reservoir no longer appears in
 * `pickLatestPerReservoir`'s output) simply stops being refreshed here and
 * ages out of the widget's freshness window on its own — no explicit
 * delete/expiry needed. See docs/specs/phase5-wra-drought-alerts.md section 2.
 */
export const upsertWraNewsItems = async (records: WraDroughtAlertRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    const now = utcNowSql();
    let inserted = 0;
    let updated = 0;

    for (const r of records) {
      const [result] = await conn.execute<ResultSetHeader>(
        `
        INSERT INTO news_items (
          source_name, feed_code, feed_name, external_id, canonical_url, source_url,
          title, description_html, payload_hash,
          published_at_utc, first_seen_at_utc, last_seen_at_utc, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          title = VALUES(title),
          description_html = VALUES(description_html),
          payload_hash = VALUES(payload_hash),
          published_at_utc = VALUES(published_at_utc),
          last_seen_at_utc = VALUES(last_seen_at_utc),
          updated_at = VALUES(updated_at)
        `,
        [
          NEWS_SOURCE_NAME,
          NEWS_FEED_CODE,
          NEWS_FEED_NAME,
          reservoirExternalId(r.reservoirName),
          WRA_RESOURCE_URL,
          WRA_RESOURCE_URL,
          r.title,
          describeBulletin(r),
          payloadHashOf(r),
          now,
          now,
          now,
          now,
          now,
        ],
      );

      // affectedRows is 1 for a fresh insert, 2 for an ON DUPLICATE KEY UPDATE
      // that changed a row — same convention as chunkedUpsert.
      if (result.affectedRows === 1) inserted += 1;
      else updated += 1;
    }

    return { inserted, updated };
  });
