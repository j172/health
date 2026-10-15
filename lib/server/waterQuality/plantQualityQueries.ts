import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type {
  PlantQualityPass,
  WaterPlantQualityItem,
  WaterPlantQualityRow,
  WaterPlantSummary,
} from "@/lib/server/waterQuality/plantQualityLookup";

/**
 * Each row carries ~3 KB of results_json (68 items; measured 2.8 KB on the real
 * file), so a chunkedUpsert call is fed 20 plants (~60 KB per statement) instead
 * of its default 500-row batch. The whole real file (~430 KB) would still fit in
 * one batch today; this keeps statements small if the file ever grows, since a
 * shared host's max_allowed_packet can be as low as 1 MB.
 */
const PLANT_UPSERT_BATCH_SIZE = 20;

export const countWaterPlantQuality = async (): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM water_plant_quality");
    return Number(rows[0]?.cnt ?? 0);
  });

/**
 * Upserts a snapshot keyed by (office_code, plant_code) — matches
 * water_plant_quality's UNIQUE KEY. Every sync re-stamps `synced_at` on every
 * row it sees (that column is how deleteStaleWaterPlantQuality tells "seen this
 * run" from "gone upstream"); like `source_updated_on` it is a plain column,
 * never part of the key, so a re-run updates in place instead of adding rows.
 */
export const upsertWaterPlantQuality = async (
  plants: WaterPlantQualityRow[],
  sourceUpdatedOn: string | null,
): Promise<{ inserted: number; updated: number }> => {
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < plants.length; i += PLANT_UPSERT_BATCH_SIZE) {
    const result = await chunkedUpsert(
      plants.slice(i, i + PLANT_UPSERT_BATCH_SIZE),
      `
      INSERT INTO water_plant_quality
        (office_code, plant_code, office_name, plant_name, plant_name_en, address, service_area,
         quality_pass, results_json, source_updated_on, synced_at, created_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        office_name = VALUES(office_name),
        plant_name = VALUES(plant_name),
        plant_name_en = VALUES(plant_name_en),
        address = VALUES(address),
        service_area = VALUES(service_area),
        quality_pass = VALUES(quality_pass),
        results_json = VALUES(results_json),
        source_updated_on = VALUES(source_updated_on),
        synced_at = VALUES(synced_at),
        updated_at = VALUES(updated_at)
      `,
      (p, now) => [
        p.officeCode,
        p.plantCode,
        p.officeName,
        p.plantName,
        p.plantNameEn,
        p.address,
        p.serviceArea,
        p.qualityPass,
        JSON.stringify(p.items.map((item) => [item.name, item.standard, item.unit, item.value])),
        sourceUpdatedOn,
        now,
        now,
        now,
      ],
    );
    inserted += result.inserted;
    updated += result.updated;
  }

  return { inserted, updated };
};

/**
 * Removes rows this run's snapshot did not touch (their `synced_at` predates
 * the moment the run started). Callers must gate this behind
 * planSnapshotReconcile() — see runSync.ts.
 */
export const deleteStaleWaterPlantQuality = async (syncStartedAtSql: string): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM water_plant_quality
       WHERE synced_at < ?`,
      [syncStartedAtSql],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

const toQualityPass = (value: unknown): PlantQualityPass | null => (value === "Y" || value === "N" ? value : null);

const toSummary = (r: RowDataPacket): WaterPlantSummary => ({
  officeName: String(r.office_name ?? ""),
  officeCode: String(r.office_code),
  plantCode: String(r.plant_code),
  plantName: String(r.plant_name),
  plantNameEn: String(r.plant_name_en ?? ""),
  address: String(r.address ?? ""),
  serviceArea: String(r.service_area ?? ""),
  qualityPass: toQualityPass(r.quality_pass),
});

/** Parses results_json back into items; a corrupt value yields [] rather than failing the whole request. */
const parseItems = (raw: unknown): WaterPlantQualityItem[] => {
  try {
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .map(([name, standard, unit, value]) => ({
        name: String(name ?? ""),
        standard: String(standard ?? ""),
        unit: String(unit ?? ""),
        value: String(value ?? ""),
      }));
  } catch {
    return [];
  }
};

export interface WaterPlantQualitySnapshot {
  plants: WaterPlantSummary[];
  /** The file's own 「更新日期」 (YYYY-MM-DD) — the newest across the table; null while empty or if the file had none. */
  sourceUpdatedOn: string | null;
  /** Newest `synced_at` (ISO 8601, UTC) — when this site last saw the file. */
  syncedAt: string | null;
}

/** Reads every plant WITHOUT its results (~46 KB for 154 plants); results come per plant from getWaterPlantQualityDetail. */
export const getWaterPlantQualitySnapshot = async (): Promise<WaterPlantQualitySnapshot> =>
  withConnection(async (conn) => {
    // DATE_FORMAT keeps the file's date as the literal string — a JS Date round-trip
    // could shift 2026-09-23 to the 22nd under a timezone offset.
    const [dbRows] = await conn.query<RowDataPacket[]>(
      `SELECT office_code, plant_code, office_name, plant_name, plant_name_en, address, service_area,
              quality_pass, DATE_FORMAT(source_updated_on, '%Y-%m-%d') AS source_updated_on, synced_at
       FROM water_plant_quality
       ORDER BY id`,
    );

    let newestSyncedMs = 0;
    let sourceUpdatedOn: string | null = null;
    const plants = dbRows.map((r) => {
      const syncedMs = r.synced_at ? new Date(r.synced_at).getTime() : 0;
      if (Number.isFinite(syncedMs) && syncedMs > newestSyncedMs) newestSyncedMs = syncedMs;
      const fileDate = r.source_updated_on ? String(r.source_updated_on) : null;
      if (fileDate && (!sourceUpdatedOn || fileDate > sourceUpdatedOn)) sourceUpdatedOn = fileDate;
      return toSummary(r);
    });

    return {
      plants,
      sourceUpdatedOn,
      syncedAt: newestSyncedMs > 0 ? new Date(newestSyncedMs).toISOString() : null,
    };
  });

export interface WaterPlantQualityDetail {
  plant: WaterPlantSummary;
  items: WaterPlantQualityItem[];
  sourceUpdatedOn: string | null;
}

/** One plant with all of its test results, or null when the key matches no row. */
export const getWaterPlantQualityDetail = async (
  officeCode: string,
  plantCode: string,
): Promise<WaterPlantQualityDetail | null> =>
  withConnection(async (conn) => {
    const [dbRows] = await conn.query<RowDataPacket[]>(
      `SELECT office_code, plant_code, office_name, plant_name, plant_name_en, address, service_area,
              quality_pass, results_json, DATE_FORMAT(source_updated_on, '%Y-%m-%d') AS source_updated_on
       FROM water_plant_quality
       WHERE office_code = ? AND plant_code = ?
       LIMIT 1`,
      [officeCode, plantCode],
    );
    const row = dbRows[0];
    if (!row) return null;
    return {
      plant: toSummary(row),
      items: parseItems(row.results_json),
      sourceUpdatedOn: row.source_updated_on ? String(row.source_updated_on) : null,
    };
  });
