import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { WaterLevelStationRecord } from "@/lib/server/wra/fetchWaterLevelStations";

export interface WaterLevelReadingListItem {
  station_id: string;
  observatory_identifier: string | null;
  check_result: string | null;
  check_desc: string | null;
  volt: number | null;
  water_level: number | null;
  recorded_at: Date;
}

/** Upserts a batch of readings, keyed by (station_id, recorded_at) — re-syncing the same reading is a no-op update, not a duplicate row. */
export const upsertWaterLevelReadings = async (
  records: WaterLevelStationRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO wra_water_level_readings
      (station_id, observatory_identifier, check_result, check_desc, volt, water_level, recorded_at, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      observatory_identifier = VALUES(observatory_identifier),
      check_result = VALUES(check_result),
      check_desc = VALUES(check_desc),
      volt = VALUES(volt),
      water_level = VALUES(water_level),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.stationId,
      r.observatoryIdentifier,
      r.checkResult,
      r.checkDesc,
      r.volt,
      r.waterLevel,
      r.recordedAt,
      now,
      now,
      now,
    ],
  );

export interface WaterLevelPageParams {
  keyword?: string;
  limit: number;
  offset: number;
}

/**
 * Latest reading per station (issue #135), optionally filtered by a
 * station-id substring — the source payload carries no station name, so the
 * id itself is the only searchable field. Mirrors getLatestAqiReadings's
 * MAX(recorded_at)-per-key join, plus issue #133's LIMIT/OFFSET pagination.
 */
export const getLatestWaterLevelReadingsPage = async ({
  keyword,
  limit,
  offset,
}: WaterLevelPageParams): Promise<{ rows: WaterLevelReadingListItem[]; total: number }> =>
  withConnection(async (conn) => {
    const keywordClause = keyword ? "AND latest.station_id LIKE ?" : "";
    const keywordParams = keyword ? [`%${keyword}%`] : [];

    const [countRows] = await conn.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT station_id, MAX(recorded_at) AS max_recorded_at
        FROM wra_water_level_readings
        GROUP BY station_id
      ) latest
      WHERE 1 = 1 ${keywordClause}
      `,
      keywordParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.station_id, r.observatory_identifier, r.check_result, r.check_desc, r.volt, r.water_level, r.recorded_at
      FROM wra_water_level_readings r
      INNER JOIN (
        SELECT station_id, MAX(recorded_at) AS max_recorded_at
        FROM wra_water_level_readings
        GROUP BY station_id
      ) latest ON latest.station_id = r.station_id AND latest.max_recorded_at = r.recorded_at
      WHERE 1 = 1 ${keywordClause}
      ORDER BY r.station_id ASC
      LIMIT ? OFFSET ?
      `,
      [...keywordParams, limit, offset],
    );

    return { total, rows: rows as unknown as WaterLevelReadingListItem[] };
  });
