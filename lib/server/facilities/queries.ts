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
  extra_json: { weeklyHours?: Record<string, string[]> } | null;
}

const UPSERT_BATCH_SIZE = 500;

/** Upserts a batch of facility records for one source, keyed by (source_key, source_id). Chunks into multi-row INSERTs — sources like NHI's clinic tier run to tens of thousands of rows, and one round-trip per row doesn't scale. */
export const upsertFacilities = async (records: FacilityRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [
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
      ]);

      const [result] = await conn.query(
        `
        INSERT INTO facilities
          (facility_type, source_key, source_id, name, address, phone, lat, lng, service_item, service_time, data_org, extra_json, synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          address = VALUES(address),
          phone = VALUES(phone),
          -- Sources with no coordinates of their own (pharmacies, health-checks)
          -- always re-sync lat/lng as NULL; don't let that clobber coordinates
          -- a geocode backfill already filled in. A source that does carry real
          -- coordinates would still update normally since VALUES(lat) is
          -- non-null and wins.
          lat = COALESCE(VALUES(lat), lat),
          lng = COALESCE(VALUES(lng), lng),
          service_item = VALUES(service_item),
          service_time = VALUES(service_time),
          data_org = VALUES(data_org),
          extra_json = VALUES(extra_json),
          synced_at = VALUES(synced_at),
          updated_at = VALUES(updated_at)
        `,
        [values],
      );

      // MySQL's upsert convention: affectedRows = 1 per new row + 2 per updated row.
      // So for a chunk of N rows, updated = affectedRows - N, inserted = N - updated.
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;
    }

    return { inserted, updated };
  });

export interface FacilityMissingCoords {
  id: number;
  address: string;
}

/** Facilities of a given type/source that still need geocoding (address present, lat/lng missing). */
// Addresses that have already failed this many times are skipped — a
// deterministic geocoder will keep failing the same bad/imprecise address
// forever, and letting those rows stay at the head of the ORDER BY id queue
// would waste most of every batch's capacity re-trying known failures
// instead of reaching rows that haven't been attempted yet.
const MAX_GEOCODE_ATTEMPTS = 3;

export const findFacilitiesMissingCoords = async (facilityType: string, sourceKey: string, limit: number): Promise<FacilityMissingCoords[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, address FROM facilities
       WHERE facility_type = ? AND source_key = ? AND lat IS NULL AND address IS NOT NULL AND address != ''
         AND geocode_attempts < ?
       ORDER BY id ASC
       LIMIT ?`,
      [facilityType, sourceKey, MAX_GEOCODE_ATTEMPTS, limit],
    );
    return rows as unknown as FacilityMissingCoords[];
  });

export const updateFacilityCoords = async (id: number, lat: number, lng: number): Promise<void> =>
  withConnection(async (conn) => {
    await conn.query("UPDATE facilities SET lat = ?, lng = ?, updated_at = ? WHERE id = ?", [lat, lng, utcNowSql(), id]);
  });

export const recordGeocodeFailure = async (id: number): Promise<void> =>
  withConnection(async (conn) => {
    await conn.query("UPDATE facilities SET geocode_attempts = geocode_attempts + 1, updated_at = ? WHERE id = ?", [utcNowSql(), id]);
  });

export interface WeeklyHoursEntry {
  sourceId: string;
  weeklyHours: Record<string, string[]>;
}

const WEEKLY_HOURS_BATCH_SIZE = 500;

/**
 * Patches facilities.extra_json.weeklyHours for existing clinic/pharmacy rows,
 * matched by source_id (NHI's 醫事機構代碼 is shared across the nhi_hospital
 * and nhi_pharmacy sources). This is an enrichment pass over rows that
 * already exist — it never inserts new facilities — so it goes through a
 * temp table + JOIN UPDATE rather than upsertFacilities()'s per-source
 * INSERT ... ON DUPLICATE KEY pattern.
 */
export const applyWeeklyHours = async (entries: WeeklyHoursEntry[]): Promise<{ matched: number }> =>
  withConnection(async (conn) => {
    if (entries.length === 0) return { matched: 0 };

    await conn.query("DROP TEMPORARY TABLE IF EXISTS tmp_weekly_hours");
    // `seq` lets the UPDATE JOIN below run in bounded slices instead of one
    // giant JOIN across the whole table — even with idx_facility_source_id
    // in place, a single multi-thousand-row JOIN UPDATE can still hold
    // facilities locked for a while, and this table is under steady
    // concurrent writes from the geocode cron.
    await conn.query(
      "CREATE TEMPORARY TABLE tmp_weekly_hours (seq INT AUTO_INCREMENT PRIMARY KEY, source_id VARCHAR(100) NOT NULL, weekly_hours JSON NOT NULL, UNIQUE KEY uq_source_id (source_id))",
    );

    for (let i = 0; i < entries.length; i += WEEKLY_HOURS_BATCH_SIZE) {
      const chunk = entries.slice(i, i + WEEKLY_HOURS_BATCH_SIZE);
      const values = chunk.map((e) => [e.sourceId, JSON.stringify(e.weeklyHours)]);
      await conn.query(
        `INSERT INTO tmp_weekly_hours (source_id, weekly_hours) VALUES ?
         ON DUPLICATE KEY UPDATE weekly_hours = VALUES(weekly_hours)`,
        [values],
      );
    }

    const [[{ maxSeq }]] = await conn.query<RowDataPacket[]>("SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM tmp_weekly_hours");
    let matched = 0;
    for (let start = 1; start <= maxSeq; start += WEEKLY_HOURS_BATCH_SIZE) {
      const [result] = await conn.query(
        `UPDATE facilities f
         JOIN tmp_weekly_hours t ON t.source_id = f.source_id AND t.seq BETWEEN ? AND ?
         SET f.extra_json = JSON_MERGE_PATCH(COALESCE(f.extra_json, JSON_OBJECT()), JSON_OBJECT('weeklyHours', JSON_EXTRACT(t.weekly_hours, '$'))),
             f.updated_at = ?
         WHERE f.source_key IN ('nhi_hospital', 'nhi_pharmacy')`,
        [start, start + WEEKLY_HOURS_BATCH_SIZE - 1, utcNowSql()],
      );
      matched += (result as { affectedRows: number }).affectedRows;
    }

    await conn.query("DROP TEMPORARY TABLE IF EXISTS tmp_weekly_hours");

    return { matched };
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
    const isGpsSearch = lat !== undefined && lng !== undefined;
    if (isGpsSearch) {
      // Haversine formula (km), Earth radius 6371km. GPS search only makes sense
      // for facilities that have already been geocoded, unlike keyword/browse
      // search which should still surface rows pending geocoding.
      distanceSelect = `,
        (6371 * acos(
          cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
          sin(radians(?)) * sin(radians(lat))
        )) AS distance_km`;
      params.unshift(lat, lng, lat);
      havingClause = "HAVING distance_km <= ?";
      conditions.push("lat IS NOT NULL AND lng IS NOT NULL");
    }

    const query = `
      SELECT id, facility_type, source_key, name, address, phone, lat, lng, service_item, service_time, data_org, extra_json
        ${distanceSelect}
      FROM facilities
      WHERE ${conditions.join(" AND ")}
      ${havingClause}
      ORDER BY ${lat !== undefined ? "distance_km ASC" : "name ASC"}
      LIMIT ?
    `;

    if (havingClause) params.push(radiusMeters / 1000);
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows as unknown as FacilityListItem[];
  });
