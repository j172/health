import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

export interface FacilityRecord {
  facilityType: string;
  sourceKey: string;
  sourceId: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  serviceItem: string | null;
  serviceTime: string | null;
  dataOrg: string | null;
  extra?: Record<string, unknown>;
}

export interface FacilityListItem {
  id: number;
  facility_type: string;
  source_key: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  service_item: string | null;
  service_time: string | null;
  data_org: string | null;
}

/** Upserts a batch of facility records for one source, keyed by (source_key, source_id). */
export const upsertFacilities = async (records: FacilityRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (const r of records) {
      const [result] = await conn.query(
        `
        INSERT INTO facilities
          (facility_type, source_key, source_id, name, address, phone, lat, lng, service_item, service_time, data_org, extra_json, synced_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          address = VALUES(address),
          phone = VALUES(phone),
          lat = VALUES(lat),
          lng = VALUES(lng),
          service_item = VALUES(service_item),
          service_time = VALUES(service_time),
          data_org = VALUES(data_org),
          extra_json = VALUES(extra_json),
          synced_at = VALUES(synced_at),
          updated_at = VALUES(updated_at)
        `,
        [
          r.facilityType,
          r.sourceKey,
          r.sourceId,
          r.name,
          r.address,
          r.phone,
          r.lat,
          r.lng,
          r.serviceItem,
          r.serviceTime,
          r.dataOrg,
          r.extra ? JSON.stringify(r.extra) : null,
          now,
          now,
          now,
        ],
      );
      // affectedRows is 1 for a plain insert, 2 for an update (MySQL's upsert convention).
      const affected = (result as { affectedRows: number }).affectedRows;
      if (affected === 1) inserted++;
      else updated++;
    }

    return { inserted, updated };
  });

export interface FacilitySearchParams {
  facilityType: string;
  keyword?: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  limit?: number;
}

/** Haversine distance filter is applied in SQL directly (facility counts are small enough that this is fine). */
export const searchFacilities = async ({ facilityType, keyword, lat, lng, radiusMeters = 5000, limit = 200 }: FacilitySearchParams): Promise<FacilityListItem[]> =>
  withConnection(async (conn) => {
    const conditions = ["facility_type = ?"];
    const params: unknown[] = [facilityType];

    if (keyword) {
      conditions.push("(name LIKE ? OR address LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    let distanceSelect = "";
    let havingClause = "";
    if (lat !== undefined && lng !== undefined) {
      // Haversine formula (km), Earth radius 6371km.
      distanceSelect = `,
        (6371 * acos(
          cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
          sin(radians(?)) * sin(radians(lat))
        )) AS distance_km`;
      params.unshift(lat, lng, lat);
      havingClause = "HAVING distance_km <= ?";
    }

    const query = `
      SELECT id, facility_type, source_key, name, address, phone, lat, lng, service_item, service_time, data_org
        ${distanceSelect}
      FROM facilities
      WHERE ${conditions.join(" AND ")} AND lat IS NOT NULL AND lng IS NOT NULL
      ${havingClause}
      ORDER BY ${lat !== undefined ? "distance_km ASC" : "name ASC"}
      LIMIT ?
    `;

    if (havingClause) params.push(radiusMeters / 1000);
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows as unknown as FacilityListItem[];
  });
