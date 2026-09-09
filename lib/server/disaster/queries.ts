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
