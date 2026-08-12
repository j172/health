import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

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

/** Upserts a batch of facility records for one source, keyed by (source_key, source_id). Chunks into multi-row INSERTs — sources like NHI's clinic tier run to tens of thousands of rows, and one round-trip per row doesn't scale. */
export const upsertFacilities = (records: FacilityRecord[]): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
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
    (r, now) => [
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
  note?: string;
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
    await conn.query(
      "CREATE TEMPORARY TABLE tmp_weekly_hours (seq INT AUTO_INCREMENT PRIMARY KEY, source_id VARCHAR(100) NOT NULL, weekly_hours JSON NOT NULL, note VARCHAR(500) NULL, UNIQUE KEY uq_source_id (source_id))",
    );

    for (let i = 0; i < entries.length; i += WEEKLY_HOURS_BATCH_SIZE) {
      const chunk = entries.slice(i, i + WEEKLY_HOURS_BATCH_SIZE);
      const values = chunk.map((e) => [e.sourceId, JSON.stringify(e.weeklyHours), e.note || null]);
      await conn.query(
        `INSERT INTO tmp_weekly_hours (source_id, weekly_hours, note) VALUES ?
         ON DUPLICATE KEY UPDATE weekly_hours = VALUES(weekly_hours), note = VALUES(note)`,
        [values],
      );
    }

    const [[{ maxSeq }]] = await conn.query<RowDataPacket[]>("SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM tmp_weekly_hours");
    let matched = 0;
    for (let start = 1; start <= maxSeq; start += WEEKLY_HOURS_BATCH_SIZE) {
      const [result] = await conn.query(
        `UPDATE facilities f
         JOIN tmp_weekly_hours t ON t.source_id = f.source_id AND t.seq BETWEEN ? AND ?
         SET f.extra_json = JSON_MERGE_PATCH(
               COALESCE(f.extra_json, JSON_OBJECT()),
               JSON_OBJECT(
                 'weeklyHours', JSON_EXTRACT(t.weekly_hours, '$'),
                 'weeklyHoursNote', t.note
               )
             ),
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
  /** Substring match against the facilities.service_item column (e.g. a hospital tier, pharmacy contract type, or one badge within a combined multi-badge value). */
  serviceItem?: string;
  sort?: "distance" | "name" | "category";
}

// Ranks the two known service_item taxonomies (hospital tier, pharmacy contract type) into one
// ordering — the value sets never overlap between facility_types, so a single CASE WHEN covers both.
const CATEGORY_RANK_SQL = `CASE service_item
  WHEN '醫學中心' THEN 1
  WHEN '區域醫院' THEN 2
  WHEN '地區醫院' THEN 3
  WHEN '基層診所' THEN 4
  WHEN '健保特約藥局' THEN 1
  WHEN '一般藥局' THEN 2
  ELSE 99
END`;

/** Haversine distance filter is applied in SQL directly (facility counts are small enough that this is fine). */
export const searchFacilities = async ({ facilityType, keyword, lat, lng, radiusMeters = 5000, limit = 200, serviceItem, sort }: FacilitySearchParams): Promise<FacilityListItem[]> =>
  withConnection(async (conn) => {
    const conditions = ["facility_type = ?"];
    const params: unknown[] = [facilityType];

    if (keyword) {
      conditions.push("(name LIKE ? OR address LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (serviceItem) {
      // Substring match, not exact — some sources (e.g. disability_atm) store
      // a combined service_item like "輪椅可及、語音服務" for a row that
      // qualifies under more than one category filter value; a plain "="
      // would make that row invisible to either single-category filter.
      // Safe for the existing exact-taxonomy sources too since none of their
      // category values are substrings of one another.
      conditions.push("service_item LIKE ?");
      params.push(`%${serviceItem}%`);
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

    // Explicit sort wins; otherwise fall back to the old implicit default
    // (distance when GPS coords are present, name otherwise).
    const orderBy =
      sort === "category"
        ? `${CATEGORY_RANK_SQL} ASC, name ASC`
        : sort === "name"
          ? "name ASC"
          : isGpsSearch
            ? "distance_km ASC"
            : "name ASC";

    const query = `
      SELECT id, facility_type, source_key, name, address, phone, lat, lng, service_item, service_time, data_org, extra_json
        ${distanceSelect}
      FROM facilities
      WHERE ${conditions.join(" AND ")}
      ${havingClause}
      ORDER BY ${orderBy}
      LIMIT ?
    `;

    if (havingClause) params.push(radiusMeters / 1000);
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows as unknown as FacilityListItem[];
  });
