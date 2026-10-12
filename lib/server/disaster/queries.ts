import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { DisasterLayer } from "@/lib/server/disaster/ingestDisasterPoints";

export interface DisasterPoint {
  id: number;
  layer: DisasterLayer;
  name: string;
  county: string;
  district: string | null;
  village: string | null;
  address: string | null;
  phone: string | null;
  lng: number;
  lat: number;
  capacity: number | null;
  disasterTypes: string | null;
  indoor: boolean | null;
  outdoor: boolean | null;
  weakSuitable: boolean | null;
  managerName: string | null;
  managerPhone: string | null;
}

export interface DisasterMapData {
  points: DisasterPoint[];
  /** Most recent sync timestamp across every layer present in `points`, or null if the table is empty. Drives the "資料更新時間" header. */
  updatedAt: string | null;
}

const toBool = (v: unknown): boolean | null =>
  v === null || v === undefined ? null : Boolean(v);

/** Reads every disaster_response_points row (shelters/rescue units/EOC centers are a few thousand rows total — small enough to fetch in one shot; the frontend filters by layer client-side via the toggle checkboxes). */
export async function getDisasterMapData(): Promise<DisasterMapData> {
  return withConnectionFallback({ points: [], updatedAt: null }, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, layer, name, county, district, village, address, phone,
              longitude, latitude, capacity, disaster_types, indoor, outdoor,
              weak_suitable, manager_name, manager_phone, source_updated_at
         FROM disaster_response_points
        ORDER BY layer, name`,
    );

    let latestUpdatedAt: string | null = null;
    const points: DisasterPoint[] = rows.map((row) => {
      const sourceUpdatedAt: string | null = row.source_updated_at
        ? new Date(row.source_updated_at).toISOString()
        : null;
      if (sourceUpdatedAt && (!latestUpdatedAt || sourceUpdatedAt > latestUpdatedAt)) {
        latestUpdatedAt = sourceUpdatedAt;
      }

      return {
        id: Number(row.id),
        layer: row.layer as DisasterLayer,
        name: String(row.name),
        county: String(row.county),
        district: row.district ?? null,
        village: row.village ?? null,
        address: row.address ?? null,
        phone: row.phone ?? null,
        lng: Number(row.longitude),
        lat: Number(row.latitude),
        capacity: row.capacity === null ? null : Number(row.capacity),
        disasterTypes: row.disaster_types ?? null,
        indoor: toBool(row.indoor),
        outdoor: toBool(row.outdoor),
        weakSuitable: toBool(row.weak_suitable),
        managerName: row.manager_name ?? null,
        managerPhone: row.manager_phone ?? null,
      };
    });

    return { points, updatedAt: latestUpdatedAt };
  });
}

export interface NearestDisasterPoint extends DisasterPoint {
  distanceKm: number;
}

/**
 * Nearest-N disaster_response_points rows for one layer, ordered by
 * Haversine distance from (lat, lng) — the "/nearby" page's (issue #466)
 * nearest-3 lookup for 避難所 (shelters). `getDisasterMapData()` above reads
 * every row unconditionally (a few thousand total, filtered client-side by
 * the disaster-map's own layer toggles); this is the opposite shape — a
 * small `LIMIT`, sorted server-side, for a single layer at a time.
 */
export async function getNearestDisasterPoints(
  lat: number,
  lng: number,
  limit: number,
  layer: DisasterLayer,
): Promise<NearestDisasterPoint[]> {
  return withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, layer, name, county, district, village, address, phone,
              longitude, latitude, capacity, disaster_types, indoor, outdoor,
              weak_suitable, manager_name, manager_phone,
        (6371 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(?)) * cos(radians(latitude)) * cos(radians(longitude) - radians(?)) +
          sin(radians(?)) * sin(radians(latitude))
        )))) AS distance_km
         FROM disaster_response_points
        WHERE layer = ?
        ORDER BY distance_km ASC
        LIMIT ?`,
      [lat, lng, lat, layer, limit],
    );

    return rows.map((row) => ({
      id: Number(row.id),
      layer: row.layer as DisasterLayer,
      name: String(row.name),
      county: String(row.county),
      district: row.district ?? null,
      village: row.village ?? null,
      address: row.address ?? null,
      phone: row.phone ?? null,
      lng: Number(row.longitude),
      lat: Number(row.latitude),
      capacity: row.capacity === null ? null : Number(row.capacity),
      disasterTypes: row.disaster_types ?? null,
      indoor: toBool(row.indoor),
      outdoor: toBool(row.outdoor),
      weakSuitable: toBool(row.weak_suitable),
      managerName: row.manager_name ?? null,
      managerPhone: row.manager_phone ?? null,
      distanceKm: Math.round(Number(row.distance_km) * 10) / 10,
    }));
  });
}
