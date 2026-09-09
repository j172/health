import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { WaterLevelStationRecord } from "@/lib/server/wra/fetchWaterLevelStations";

import { ensureCatalogsSeeded } from "@/lib/server/wra/catalogQueries";

export interface WaterLevelReadingListItem {
  station_id: string;
  station_name: string | null;
  river_name: string | null;
  location_address: string | null;
  alert_level_1: number | null;
  alert_level_2: number | null;
  alert_level_3: number | null;
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
  region?: string;
  limit: number;
  offset: number;
}

const buildRegionClause = (region: string): string => {
  switch (region) {
    case "10":
    case "north":
    case "北部":
      return "(c.basin_code LIKE '10%' OR c.basin_code LIKE '11%' OR c.location_address LIKE '%基隆%' OR c.location_address LIKE '%臺北%' OR c.location_address LIKE '%台北%' OR c.location_address LIKE '%新北%' OR c.location_address LIKE '%桃園%' OR c.location_address LIKE '%新竹%' OR c.location_address LIKE '%宜蘭%')";
    case "20":
    case "central":
    case "中部":
      return "(c.basin_code LIKE '12%' OR c.basin_code LIKE '13%' OR c.basin_code LIKE '14%' OR c.location_address LIKE '%苗栗%' OR c.location_address LIKE '%臺中%' OR c.location_address LIKE '%台中%' OR c.location_address LIKE '%彰化%' OR c.location_address LIKE '%南投%' OR c.location_address LIKE '%雲林%')";
    case "30":
    case "south":
    case "南部":
      return "(c.basin_code LIKE '15%' OR c.basin_code LIKE '16%' OR c.basin_code LIKE '17%' OR c.location_address LIKE '%嘉義%' OR c.location_address LIKE '%臺南%' OR c.location_address LIKE '%台南%' OR c.location_address LIKE '%高雄%' OR c.location_address LIKE '%屏東%')";
    case "40":
    case "east":
    case "東部":
      return "(c.basin_code LIKE '18%' OR c.basin_code LIKE '19%' OR c.location_address LIKE '%花蓮%' OR c.location_address LIKE '%臺東%' OR c.location_address LIKE '%台東%')";
    case "50":
    case "islands":
    case "離島":
      return "(c.location_address LIKE '%澎湖%' OR c.location_address LIKE '%金門%' OR c.location_address LIKE '%連江%')";
    default:
      return "";
  }
};

/**
 * Latest reading per station, joined with wra_water_level_stations catalog for official
 * Chinese station name, river, address, and alert levels 1/2/3. Supports keyword search
 * and region filter.
 */
export const getLatestWaterLevelReadingsPage = async ({
  keyword,
  region,
  limit,
  offset,
}: WaterLevelPageParams): Promise<{ rows: WaterLevelReadingListItem[]; total: number }> => {
  // Ensure catalog table is populated on cold start
  await ensureCatalogsSeeded().catch(() => {});

  return withConnection(async (conn) => {
    const conditions: string[] = ["1 = 1"];
    const params: unknown[] = [];

    if (region) {
      const regionClause = buildRegionClause(region);
      if (regionClause) {
        conditions.push(regionClause);
      }
    }

    if (keyword) {
      const kw = `%${keyword}%`;
      conditions.push(
        "(latest.station_id LIKE ? OR c.station_name LIKE ? OR c.river_name LIKE ? OR c.location_address LIKE ?)",
      );
      params.push(kw, kw, kw, kw);
    }

    const whereSql = conditions.join(" AND ");

    const [countRows] = await conn.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT station_id, MAX(recorded_at) AS max_recorded_at
        FROM wra_water_level_readings
        GROUP BY station_id
      ) latest
      LEFT JOIN wra_water_level_stations c ON c.station_id = latest.station_id
      WHERE ${whereSql}
      `,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.station_id, c.station_name, c.river_name, c.location_address,
             c.alert_level_1, c.alert_level_2, c.alert_level_3,
             r.observatory_identifier, r.check_result, r.check_desc, r.volt, r.water_level, r.recorded_at
      FROM wra_water_level_readings r
      INNER JOIN (
        SELECT station_id, MAX(recorded_at) AS max_recorded_at
        FROM wra_water_level_readings
        GROUP BY station_id
      ) latest ON latest.station_id = r.station_id AND latest.max_recorded_at = r.recorded_at
      LEFT JOIN wra_water_level_stations c ON c.station_id = r.station_id
      WHERE ${whereSql}
      ORDER BY r.station_id ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return { total, rows: rows as unknown as WaterLevelReadingListItem[] };
  });
};
