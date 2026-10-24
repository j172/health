export interface ResolvedStationInfo {
  stationId: string;
  stationName: string;
  county?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** In-memory cache to reduce repeated DB queries for unchanged station dimensions */
const stationCache = new Map<string, ResolvedStationInfo>();

/**
 * Resolves station name, county, and coordinates by station_id and rail_system.
 * Queries accessible_transit_facilities or uses cached dimensions.
 */
export async function resolveStationMetadata(
  railSystem: string,
  stationId: string,
  fallbackName?: string,
  deps: {
    lookupFn?: (system: string, id: string, name?: string) => Promise<ResolvedStationInfo>;
  } = {},
): Promise<ResolvedStationInfo> {
  const cacheKey = `${railSystem}:${stationId}`;
  if (stationCache.has(cacheKey)) {
    return stationCache.get(cacheKey)!;
  }

  const defaultResult: ResolvedStationInfo = {
    stationId,
    stationName: fallbackName || stationId,
  };

  if (!stationId || stationId === "ALL") {
    return defaultResult;
  }

  if (deps.lookupFn) {
    const res = await deps.lookupFn(railSystem, stationId, fallbackName);
    stationCache.set(cacheKey, res);
    return res;
  }

  try {
    const { getPool } = await import("../../db/mysql");
    const pool = getPool();
    if (!pool) return defaultResult;

    const [rows]: any = await pool.query(
      `SELECT station_or_agency, county, lat, lng
       FROM accessible_transit_facilities
       WHERE station_id = ?
       LIMIT 1`,
      [stationId],
    );

    if (rows && rows.length > 0) {
      const row = rows[0];
      const info: ResolvedStationInfo = {
        stationId,
        stationName: fallbackName || row.station_or_agency || stationId,
        county: row.county || null,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
      };
      stationCache.set(cacheKey, info);
      return info;
    }
  } catch {
    // Non-fatal: database lookup failure falls back gracefully
  }

  return defaultResult;
}

export function clearStationCache(): void {
  stationCache.clear();
}
