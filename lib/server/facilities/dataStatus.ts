import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { toFacilityDataStatus, type FacilityDataStatus } from "@/lib/format/facilityDataStatus";

/**
 * Row count and newest import time of ONE source inside a facility type —
 * what /api/facilities returns as `dataStatus` when asked with
 * `?dataStatusSource=<source_key>` (issue #678, Track B B-8).
 *
 * Scoped to (facility_type, source_key) rather than the whole type because
 * "long_term_care" mixes several sources: the count that matters for the
 * nursing-institution notice is only the manually imported 115950 rows
 * (`nhplatform_115950_ltc`), not the LTC GIS rows around them. `source_key`
 * is the leading column of uq_facility_source, so this stays an index range
 * scan. Throws on a DB failure — callers must treat that as "unknown", never
 * as zero rows (a false 「資料暫缺」 would be as dishonest as a false date).
 */
export async function getFacilitySourceDataStatus(
  facilityType: string,
  sourceKey: string,
): Promise<FacilityDataStatus> {
  return withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, MAX(synced_at) AS last_synced_at
       FROM facilities
       WHERE facility_type = ? AND source_key = ?`,
      [facilityType, sourceKey],
    );
    return toFacilityDataStatus(rows[0]?.total, rows[0]?.last_synced_at);
  });
}
