import { fetchCwaEarthquakes } from "@/lib/server/cwa/sources/earthquake";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";
import { toMysqlDatetimeUtc } from "@/lib/server/earthquakes/types";

/**
 * Adapts CWA's 地震報告 (significant earthquake reports, E-A0015-001) into
 * the same IncomingEarthquake shape the USGS/EMSC/HKO adapters produce, so
 * upsertEarthquake's fuzzy cross-source match/merge applies here too — a
 * Taiwan-area quake that both CWA and USGS report lands as one row instead
 * of two, with sources_json.cwa marking it as CWA-covered for the M4.0+
 * display tier (see getTieredEarthquakes).
 */
export async function fetchCwaEarthquakesAsIncoming(): Promise<IncomingEarthquake[]> {
  const records = await fetchCwaEarthquakes();

  return records
    .filter((r) => r.originTime != null && r.epicenterLat != null && r.epicenterLng != null)
    .map((r): IncomingEarthquake => ({
      source: "cwa",
      sourceEventId: String(r.earthquakeNo),
      // OriginTime is "yyyy-MM-dd HH:mm:ss" in Taipei local time (CWA has no
      // UTC variant), not UTC like the other sources' native timestamps —
      // the "+08:00" suffix is required so Date parses it as that offset
      // instead of the process's own (UTC) timezone, which would otherwise
      // silently shift every CWA event 8 hours into the future.
      eventTime: toMysqlDatetimeUtc(new Date(`${(r.originTime as string).replace(" ", "T")}+08:00`)),
      magnitude: r.magnitudeValue,
      magnitudeType: r.magnitudeType,
      depthKm: r.focalDepth,
      lat: r.epicenterLat as number,
      lng: r.epicenterLng as number,
      place: null,
      placeZh: r.location,
      tsunamiWarning: false,
      url: r.web,
    }));
}
