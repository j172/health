import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { FOREST_FIRE_LEVELS } from "@/lib/tools/forestFire/levels";
import { buildForestFireOverview } from "./overview";
import type { ForestFireOverview, ForestFireRow, StoredForestFireRow } from "./types";

/**
 * Upserts today's accepted rows keyed by site_code — matches forest_fire_alerts'
 * UNIQUE KEY in schema.ts. created_date and the level are ordinary columns that
 * are overwritten on every sync, so the table stays at ~61 rows forever instead
 * of growing by one row per site per day.
 *
 * Deliberately upsert-only: there is no DELETE anywhere in this module. A failed
 * or empty fetch leaves the previous rows in place, and the reader flags rows
 * not dated today as stale instead of presenting them as current.
 */
export const upsertForestFireAlerts = async (
  rows: ForestFireRow[],
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    rows,
    `
    INSERT INTO forest_fire_alerts
      (site_code, site_name, warn_level, warn_level_chinese, created_date,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      site_name = VALUES(site_name),
      warn_level = VALUES(warn_level),
      warn_level_chinese = VALUES(warn_level_chinese),
      created_date = VALUES(created_date),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (row, now) => [
      row.siteCode,
      row.name,
      row.level,
      FOREST_FIRE_LEVELS[row.level].name,
      row.createdDate,
      now,
      now,
      now,
    ],
  );
};

/** Rows older than this many days are treated as "no data" rather than shown as stale. */
export const FOREST_FIRE_MAX_AGE_DAYS = 7;

const shiftIsoDate = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const getStoredForestFireRows = async (today: string): Promise<StoredForestFireRow[]> =>
  withConnection(async (conn) => {
    const cutoff = shiftIsoDate(today, -FOREST_FIRE_MAX_AGE_DAYS);
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT site_code, site_name, warn_level,
              DATE_FORMAT(created_date, '%Y-%m-%d') AS created_date
         FROM forest_fire_alerts
        WHERE created_date >= ?
        ORDER BY site_code`,
      [cutoff],
    );
    return rows.map((r) => ({
      siteCode: String(r.site_code),
      siteName: String(r.site_name),
      warnLevel: Number(r.warn_level),
      createdDate: String(r.created_date),
    }));
  });

/** Reads forest_fire_alerts and shapes the payload for /api/outdoor-safety/forest-fire. */
export const getForestFireOverview = async (today: string): Promise<ForestFireOverview> =>
  buildForestFireOverview(await getStoredForestFireRows(today), today);
