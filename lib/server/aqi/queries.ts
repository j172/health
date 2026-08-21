import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { AqiSiteSnapshot } from "@/lib/server/aqi/fetchAqi";
import { memoizeQuery } from "@/lib/server/cache/memo";

export interface AqiReadingRow {
  site_id: string;
  site_name: string;
  county: string;
  lat: number | null;
  lng: number | null;
  aqi_value: number | null;
  aqi_status: string | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  recorded_at: Date;
}

/** Upserts one hourly snapshot per site, keyed by (site_id, recorded_at) — re-running the same hour is a no-op update, not a duplicate row. */
export const upsertAqiReadings = async (
  sites: AqiSiteSnapshot[],
): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    if (sites.length === 0) return { inserted: 0, updated: 0 };
    const now = utcNowSql();

    const values = sites.map((s) => [
      s.siteId,
      s.siteName,
      s.county,
      s.lat,
      s.lng,
      s.aqiValue,
      s.aqiStatus,
      s.pm25,
      s.pm10,
      s.o3,
      s.no2,
      s.so2,
      s.co,
      s.recordedAt,
      now,
      now,
      now,
    ]);

    const [result] = await conn.query(
      `
      INSERT INTO aqi_readings
        (site_id, site_name, county, lat, lng, aqi_value, aqi_status, pm25, pm10, o3, no2, so2, co, recorded_at, synced_at, created_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        site_name = VALUES(site_name),
        county = VALUES(county),
        lat = VALUES(lat),
        lng = VALUES(lng),
        aqi_value = VALUES(aqi_value),
        aqi_status = VALUES(aqi_status),
        pm25 = VALUES(pm25),
        pm10 = VALUES(pm10),
        o3 = VALUES(o3),
        no2 = VALUES(no2),
        so2 = VALUES(so2),
        co = VALUES(co),
        synced_at = VALUES(synced_at),
        updated_at = VALUES(updated_at)
      `,
      [values],
    );

    // MySQL's upsert convention: affectedRows = 1 per new row + 2 per updated row.
    const affected = (result as { affectedRows: number }).affectedRows;
    const updated = affected - sites.length;
    return { inserted: sites.length - updated, updated };
  });

/** Latest reading per site, optionally filtered by county substring, ordered by site name. */
export const getLatestAqiReadings = async (
  county?: string,
): Promise<AqiReadingRow[]> =>
  // §3.3 — this renders on every /tools/aqi hit and the data only moves hourly.
  memoizeQuery(`latest_aqi_readings_${county ?? "all"}`, async () =>
    withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
      SELECT r.site_id, r.site_name, r.county, r.lat, r.lng, r.aqi_value, r.aqi_status, r.pm25, r.pm10, r.o3, r.no2, r.so2, r.co, r.recorded_at
      FROM aqi_readings r
      INNER JOIN (
        SELECT site_id, MAX(recorded_at) AS max_recorded_at
        FROM aqi_readings
        GROUP BY site_id
      ) latest ON latest.site_id = r.site_id AND latest.max_recorded_at = r.recorded_at
      WHERE ? = '' OR r.county LIKE CONCAT('%', ?, '%')
      ORDER BY r.site_name ASC
      `,
        [county ?? "", county ?? ""],
      );
      return rows as unknown as AqiReadingRow[];
    }),
  );

/** Nearest station's latest reading to a given point (Haversine, km). Only considers geocoded stations. */
export const getNearestAqiReading = async (
  lat: number,
  lng: number,
): Promise<(AqiReadingRow & { distance_km: number }) | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.site_id, r.site_name, r.county, r.lat, r.lng, r.aqi_value, r.aqi_status, r.pm25, r.pm10, r.o3, r.no2, r.so2, r.co, r.recorded_at,
        (6371 * acos(
          cos(radians(?)) * cos(radians(r.lat)) * cos(radians(r.lng) - radians(?)) +
          sin(radians(?)) * sin(radians(r.lat))
        )) AS distance_km
      FROM aqi_readings r
      INNER JOIN (
        SELECT site_id, MAX(recorded_at) AS max_recorded_at
        FROM aqi_readings
        GROUP BY site_id
      ) latest ON latest.site_id = r.site_id AND latest.max_recorded_at = r.recorded_at
      WHERE r.lat IS NOT NULL AND r.lng IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    return (
      (rows[0] as unknown as AqiReadingRow & { distance_km: number }) ?? null
    );
  });
