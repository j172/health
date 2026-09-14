import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { GroundwaterStationRecord } from "@/lib/server/wra/fetchGroundwaterLevelStations";

/** Latest-snapshot upsert keyed by station_id — see schema.ts's wraGroundwaterStations comment. */
export const upsertGroundwaterStations = async (
  records: GroundwaterStationRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO wra_groundwater_stations
      (station_id, iow_station_id, name, county_code, county_name, town_code, town_name, admin_name,
       lat, lng, water_level_m, measurements_json, recorded_at, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      iow_station_id = VALUES(iow_station_id),
      name = VALUES(name),
      county_code = VALUES(county_code),
      county_name = VALUES(county_name),
      town_code = VALUES(town_code),
      town_name = VALUES(town_name),
      admin_name = VALUES(admin_name),
      lat = VALUES(lat),
      lng = VALUES(lng),
      water_level_m = VALUES(water_level_m),
      measurements_json = VALUES(measurements_json),
      recorded_at = VALUES(recorded_at),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.stationId,
      r.iowStationId,
      r.name,
      r.countyCode,
      r.countyName,
      r.townCode,
      r.townName,
      r.adminName,
      r.lat,
      r.lng,
      r.waterLevelM,
      JSON.stringify(r.measurements),
      r.recordedAt,
      now,
      now,
      now,
    ],
  );

export interface GroundwaterMapPoint {
  stationId: string;
  name: string;
  countyName: string | null;
  townName: string | null;
  adminName: string | null;
  lat: number;
  lng: number;
  waterLevelM: number | null;
  recordedAt: string | null;
}

/** All stations for the disaster-map layer toggle — small table (a few hundred rows), no pagination needed. */
export const getGroundwaterMapPoints = async (): Promise<GroundwaterMapPoint[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT station_id, name, county_name, town_name, admin_name, lat, lng, water_level_m,
              DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS recorded_at
       FROM wra_groundwater_stations
       ORDER BY station_id ASC`,
    );

    return rows.map(
      (r): GroundwaterMapPoint => ({
        stationId: r.station_id,
        name: r.name,
        countyName: r.county_name,
        townName: r.town_name,
        adminName: r.admin_name,
        lat: Number(r.lat),
        lng: Number(r.lng),
        waterLevelM: r.water_level_m === null ? null : Number(r.water_level_m),
        recordedAt: r.recorded_at ?? null,
      }),
    );
  });
