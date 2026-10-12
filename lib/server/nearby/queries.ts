import "server-only";
import { searchFacilities } from "@/lib/server/facilities/queries";
import { getEmergencyRoomOverview } from "@/lib/server/emergencyRooms/queries";
import { getNearestDisasterPoints } from "@/lib/server/disaster/queries";
import { aggregateNearbyTypes, type NearbyItem, type NearbyTypeResult, type NearbyTypeTask } from "./aggregate";
import { findNearbyTypeDef, type NearbyTypeDef } from "./registry";

/**
 * Effectively-unbounded search radius for "/nearby"'s per-type nearest-N
 * lookups (issue #466): the page always wants the N closest rows nationwide,
 * never a hard "give up beyond X km" cutoff the way the per-tool pages' own
 * default radius does — Taiwan's longest corner-to-corner distance (including
 * outlying islands) is well under this. `searchFacilities()`'s `HAVING
 * distance_km <= radiusMeters/1000` clause then becomes a no-op in practice,
 * leaving `ORDER BY distance_km ASC LIMIT ?` to do the actual work.
 */
const NEARBY_SEARCH_RADIUS_METERS = 1_000_000;

/** Builds the one `NearbyTypeTask` for a given type definition + user location, deferring the actual query until `run()` is awaited by `aggregateNearbyTypes`. */
function buildTask(def: NearbyTypeDef, lat: number, lng: number, limit: number): NearbyTypeTask {
  return {
    key: def.key,
    label: def.label,
    emoji: def.emoji,
    run: async (): Promise<NearbyItem[]> => {
      if (def.kind === "facility") {
        const rows = await searchFacilities({
          facilityType: def.facilityType as string,
          lat,
          lng,
          radiusMeters: NEARBY_SEARCH_RADIUS_METERS,
          sort: "distance",
          limit,
        });
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          address: row.address,
          phone: row.phone,
          lat: row.lat,
          lng: row.lng,
          distanceKm: typeof row.distance_km === "number" ? Math.round(row.distance_km * 10) / 10 : null,
        }));
      }

      if (def.kind === "er") {
        const overview = await getEmergencyRoomOverview({ lat, lng, limit });
        return overview.items.slice(0, limit).map((item) => ({
          id: item.id ?? item.hospital_code,
          name: item.hospital_name,
          address: item.address ?? null,
          phone: item.phone ?? null,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
          distanceKm: typeof item.distance_km === "number" ? item.distance_km : null,
          extra: {
            congestionLevel: item.congestion_level,
            isFullReported: item.is_full_reported,
            waitingConsultation: item.waiting_consultation,
          },
        }));
      }

      // kind === "shelter"
      const points = await getNearestDisasterPoints(lat, lng, limit, "shelter");
      return points.map((point) => ({
        id: point.id,
        name: point.name,
        address: point.address,
        phone: point.phone,
        lat: point.lat,
        lng: point.lng,
        distanceKm: point.distanceKm,
        extra: { capacity: point.capacity, indoor: point.indoor, outdoor: point.outdoor },
      }));
    },
  };
}

export interface FetchNearbyResultsOutput {
  results: NearbyTypeResult[];
  /** `types=` values that didn't resolve to any known NearbyTypeDef — reported, never silently dropped. */
  unknownKeys: string[];
}

/**
 * Resolves each requested type key to its NearbyTypeDef, runs them all
 * through `aggregateNearbyTypes()` (Promise.allSettled per-type isolation),
 * and reports any key that didn't resolve to a known type at all (a typo or
 * a stale client) separately from a type that resolved but failed at query
 * time — neither case is allowed to affect any other type's result.
 */
export async function fetchNearbyResults(
  keys: string[],
  lat: number,
  lng: number,
  limit: number,
): Promise<FetchNearbyResultsOutput> {
  const defs: NearbyTypeDef[] = [];
  const unknownKeys: string[] = [];

  for (const key of keys) {
    const def = findNearbyTypeDef(key);
    if (def) {
      defs.push(def);
    } else {
      unknownKeys.push(key);
    }
  }

  const tasks = defs.map((def) => buildTask(def, lat, lng, limit));
  const results = await aggregateNearbyTypes(tasks);
  return { results, unknownKeys };
}
