import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type {
  GenerationMixRecord,
  GenerationUnitRecord,
  RadiationStationRecord,
} from "./types";

// --- 台電 d006001 各機組即時發電量 ------------------------------------------

export interface GenerationUnitListItem {
  unit_name: string;
  unit_type: string;
  capacity_mw: number | null;
  net_generation_mw: number | null;
  capacity_ratio_pct: number | null;
  remark: string | null;
  source_datetime: string | null;
}

/** Latest-snapshot upsert keyed by unit_name — see schema.ts's powerGenerationUnits comment. */
export const upsertGenerationUnits = async (
  records: GenerationUnitRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO power_generation_units
      (unit_name, unit_type, capacity_mw, net_generation_mw, capacity_ratio_pct, remark, source_datetime,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      unit_type = VALUES(unit_type),
      capacity_mw = VALUES(capacity_mw),
      net_generation_mw = VALUES(net_generation_mw),
      capacity_ratio_pct = VALUES(capacity_ratio_pct),
      remark = VALUES(remark),
      source_datetime = VALUES(source_datetime),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.unitName,
      r.unitType,
      r.capacityMw,
      r.netGenerationMw,
      r.capacityRatioPct,
      r.remark,
      r.sourceDatetime,
      now,
      now,
      now,
    ],
  );

export const getGenerationUnits = async (): Promise<GenerationUnitListItem[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT unit_name, unit_type, capacity_mw, net_generation_mw, capacity_ratio_pct, remark,
              DATE_FORMAT(source_datetime, '%Y-%m-%d %H:%i:%s') AS source_datetime
       FROM power_generation_units
       ORDER BY unit_type ASC, unit_name ASC`,
    );
    return rows as unknown as GenerationUnitListItem[];
  });

// --- 經濟部能源署 set_id=55 全國發電來源配比 --------------------------------

export interface GenerationMixListItem {
  source_category: string;
  capacity_mw: number | null;
  capacity_ratio_pct: number | null;
  data_org: string | null;
}

/** Latest-snapshot upsert keyed by source_category — only ~4 rows total. */
export const upsertGenerationMix = async (
  records: GenerationMixRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO power_generation_mix
      (source_category, capacity_mw, capacity_ratio_pct, data_org, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      capacity_mw = VALUES(capacity_mw),
      capacity_ratio_pct = VALUES(capacity_ratio_pct),
      data_org = VALUES(data_org),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [r.sourceCategory, r.capacityMw, r.capacityRatioPct, r.dataOrg, now, now, now],
  );

export const getGenerationMix = async (): Promise<GenerationMixListItem[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT source_category, capacity_mw, capacity_ratio_pct, data_org
       FROM power_generation_mix
       ORDER BY capacity_mw DESC`,
    );
    return rows as unknown as GenerationMixListItem[];
  });

// --- 台電 d525001 核電廠周邊輻射偵測站 (安全監測，非停電資料) -----------------

export interface RadiationStationListItem {
  station_no: string;
  station_name: string;
  dose_rate_usv_h: number | null;
  recorded_at: string | null;
  lat: number | null;
  lng: number | null;
}

/** Latest-snapshot upsert keyed by station_no — see schema.ts's powerRadiationStations comment. */
export const upsertRadiationStations = async (
  records: RadiationStationRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO power_radiation_stations
      (station_no, station_name, dose_rate_usv_h, recorded_at, lat, lng, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      station_name = VALUES(station_name),
      dose_rate_usv_h = VALUES(dose_rate_usv_h),
      recorded_at = VALUES(recorded_at),
      lat = VALUES(lat),
      lng = VALUES(lng),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [r.stationNo, r.stationName, r.doseRateUsvH, r.recordedAt, r.lat, r.lng, now, now, now],
  );

export const getRadiationStations = async (): Promise<RadiationStationListItem[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT station_no, station_name, dose_rate_usv_h,
              DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at, lat, lng
       FROM power_radiation_stations
       ORDER BY station_no ASC`,
    );
    return rows as unknown as RadiationStationListItem[];
  });
