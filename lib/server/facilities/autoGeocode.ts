import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { cleanAddress, extractRoadKey } from "@/lib/server/facilities/addressNormalize";
import { runGeocodeBatch, type GeocodeBatchSummary } from "@/lib/server/facilities/geocodeBatch";

/**
 * 1. Inline Ingestion Cache Matcher (方案 A):
 * Populates lat/lng in-place for any incoming FacilityRecord missing coordinates,
 * by matching exact normalized addresses against already-geocoded facilities in the DB.
 * Runs in milliseconds with zero external API calls.
 */
export async function populateCoordinatesFromCache(
  conn: PoolConnection,
  records: FacilityRecord[],
): Promise<{ matched: number; remainingMissing: number }> {
  const missingRecords: FacilityRecord[] = [];
  const normalizedKeys: string[] = [];

  for (const r of records) {
    if ((r.lat == null || r.lng == null) && r.address && r.address.trim()) {
      missingRecords.push(r);
      const cleaned = cleanAddress(r.address);
      if (cleaned) {
        normalizedKeys.push(cleaned);
      }
    }
  }

  if (missingRecords.length === 0 || normalizedKeys.length === 0) {
    return { matched: 0, remainingMissing: 0 };
  }

  // Deduplicate keys for query
  const uniqueKeys = Array.from(new Set(normalizedKeys));
  
  // We match against already geocoded facilities.
  // Using an in-memory normalized map for clean exact matches:
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT address, lat, lng FROM facilities 
     WHERE lat IS NOT NULL AND address IS NOT NULL AND address != '' 
     LIMIT 60000`,
  );

  const addressMap = new Map<string, { lat: number; lng: number }>();
  for (const row of rows) {
    const norm = cleanAddress(String(row.address));
    if (norm && !addressMap.has(norm) && row.lat != null && row.lng != null) {
      addressMap.set(norm, { lat: Number(row.lat), lng: Number(row.lng) });
    }
  }

  let matched = 0;
  for (const r of missingRecords) {
    if (!r.address) continue;
    const norm = cleanAddress(r.address);
    const coords = addressMap.get(norm);
    if (coords) {
      r.lat = coords.lat;
      r.lng = coords.lng;
      matched++;
    }
  }

  const remainingMissing = missingRecords.length - matched;
  return { matched, remainingMissing };
}

/**
 * Road-level fallback resolver (方案 1 Fallback):
 * If external geocoding providers return no result or budget is exhausted,
 * lookup known road segment coordinates from DB.
 */
export async function resolveRoadLevelFallback(
  conn: PoolConnection,
  rawAddress: string,
): Promise<{ lat: number; lng: number } | null> {
  const roadKey = extractRoadKey(rawAddress);
  if (!roadKey) return null;

  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT lat, lng FROM facilities 
     WHERE lat IS NOT NULL AND address LIKE ?
     LIMIT 1`,
    [`%${roadKey}%`],
  );

  if (rows[0] && rows[0].lat != null && rows[0].lng != null) {
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lng) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Debounced Background Worker Trigger (方案 B + 方案 I)
// ---------------------------------------------------------------------------
let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Fires a debounced background geocode job without blocking the HTTP response.
 * Guarded by MySQL Advisory Lock inside runGeocodeBatch.
 */
export function triggerBackgroundGeocode(delayMs = 3000): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    (async () => {
      try {
        const startTime = Date.now();
        const summary = await runGeocodeBatch();
        const durationMs = Date.now() - startTime;

        // Log to ingest_runs table if any attempts were made (方案 X)
        if (summary.totalAttempted > 0 || summary.totalGeocoded > 0) {
          await withConnection(async (conn) => {
            await conn.query(
              `INSERT INTO ingest_runs 
               (trigger_type, status, started_at, ended_at, duration_ms, fetched_count, inserted_count, updated_count, summary_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                "facilities_auto_geocode",
                "success",
                utcNowSql(),
                utcNowSql(),
                durationMs,
                summary.totalAttempted,
                summary.totalGeocoded,
                summary.totalFailed,
                JSON.stringify(summary),
                utcNowSql(),
                utcNowSql(),
              ],
            );
          });
        }
      } catch (err) {
        console.error("triggerBackgroundGeocode failed:", err);
      }
    })();
  }, delayMs);
}
