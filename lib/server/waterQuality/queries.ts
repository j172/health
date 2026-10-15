import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { WaterHardnessRow } from "@/lib/server/waterQuality/hardnessLookup";

export const countWaterHardness = async (): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM water_hardness_township");
    return Number(rows[0]?.cnt ?? 0);
  });

/**
 * Upserts a snapshot keyed by (county, district) — matches
 * water_hardness_township's UNIQUE KEY. Every sync re-stamps `synced_at` on
 * every row it sees (that column is how deleteStaleWaterHardness tells "seen
 * this run" from "gone upstream"), and it is a plain column, never part of the
 * key, so a re-run updates in place instead of adding rows.
 */
export const upsertWaterHardness = async (
  rows: WaterHardnessRow[],
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    rows,
    `
    INSERT INTO water_hardness_township
      (county, district, hardness_mg_l, unit, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      hardness_mg_l = VALUES(hardness_mg_l),
      unit = VALUES(unit),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [r.county, r.district, r.hardnessMgPerL, r.unit, now, now, now],
  );
};

/**
 * Removes rows this run's snapshot did not touch (their `synced_at` predates
 * the moment the run started). Callers must gate this behind
 * planSnapshotReconcile() — see runSync.ts.
 */
export const deleteStaleWaterHardness = async (syncStartedAtSql: string): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM water_hardness_township
       WHERE synced_at < ?`,
      [syncStartedAtSql],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

export interface WaterHardnessSnapshot {
  rows: WaterHardnessRow[];
  /** Newest `synced_at` across the table (ISO 8601, UTC) — null while the table is empty. */
  syncedAt: string | null;
}

/** Reads the whole table (a few hundred rows) in file order. */
export const getWaterHardnessSnapshot = async (): Promise<WaterHardnessSnapshot> =>
  withConnection(async (conn) => {
    const [dbRows] = await conn.query<RowDataPacket[]>(
      `SELECT county, district, hardness_mg_l, unit, synced_at
       FROM water_hardness_township
       ORDER BY id`,
    );

    let newest = 0;
    const rows: WaterHardnessRow[] = dbRows.map((r) => {
      const syncedMs = r.synced_at ? new Date(r.synced_at).getTime() : 0;
      if (Number.isFinite(syncedMs) && syncedMs > newest) newest = syncedMs;
      return {
        county: String(r.county),
        district: String(r.district),
        hardnessMgPerL: Number(r.hardness_mg_l),
        unit: String(r.unit),
      };
    });

    return { rows, syncedAt: newest > 0 ? new Date(newest).toISOString() : null };
  });
