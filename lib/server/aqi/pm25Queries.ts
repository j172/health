import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { Pm25SiteSnapshot } from "@/lib/server/aqi/fetchPm25";

export interface Pm25ReadingRow {
  site_name: string;
  county: string;
  lat: number | null;
  lng: number | null;
  pm25: number | null;
  recorded_at: Date;
}

/**
 * Upserts one reading per site, keyed by (site_name, recorded_at). The
 * AQX_P_02 payload carries no coordinates of its own — this shares the same
 * ~79-station network as aqi_readings (AQX_P_432), so lat/lng is resolved by
 * matching (site_name, county) against that table and stored here directly
 * (avoids a runtime cross-table join on every nearest-station lookup).
 */
export const upsertPm25Readings = async (sites: Pm25SiteSnapshot[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    if (sites.length === 0) return { inserted: 0, updated: 0 };

    const [coordRows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT site_name, county, lat, lng FROM aqi_readings WHERE lat IS NOT NULL AND lng IS NOT NULL`,
    );
    const coordsByKey = new Map<string, { lat: number; lng: number }>();
    for (const row of coordRows as { site_name: string; county: string; lat: number; lng: number }[]) {
      coordsByKey.set(`${row.site_name}|${row.county}`, { lat: row.lat, lng: row.lng });
    }

    const now = utcNowSql();
    const values = sites.map((s) => {
      const coords = coordsByKey.get(`${s.siteName}|${s.county}`);
      return [s.siteName, s.county, coords?.lat ?? null, coords?.lng ?? null, s.pm25, s.recordedAt, now, now, now];
    });

    const [result] = await conn.query(
      `
      INSERT INTO pm25_readings
        (site_name, county, lat, lng, pm25, recorded_at, synced_at, created_at, updated_at)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        lat = VALUES(lat),
        lng = VALUES(lng),
        pm25 = VALUES(pm25),
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

/** Nearest station's latest PM2.5 reading to a given point (Haversine, km). Only considers geocoded stations. */
export const getNearestPm25Reading = async (lat: number, lng: number): Promise<(Pm25ReadingRow & { distance_km: number }) | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.site_name, r.county, r.lat, r.lng, r.pm25, r.recorded_at,
        (6371 * acos(
          cos(radians(?)) * cos(radians(r.lat)) * cos(radians(r.lng) - radians(?)) +
          sin(radians(?)) * sin(radians(r.lat))
        )) AS distance_km
      FROM pm25_readings r
      INNER JOIN (
        SELECT site_name, MAX(recorded_at) AS max_recorded_at
        FROM pm25_readings
        GROUP BY site_name
      ) latest ON latest.site_name = r.site_name AND latest.max_recorded_at = r.recorded_at
      WHERE r.lat IS NOT NULL AND r.lng IS NOT NULL
      ORDER BY distance_km ASC
      LIMIT 1
      `,
      [lat, lng, lat],
    );
    return (rows[0] as unknown as (Pm25ReadingRow & { distance_km: number })) ?? null;
  });
