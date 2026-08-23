import { fetchCwaEarthquakes } from "@/lib/server/cwa/sources/earthquake";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";
import { toMysqlDatetimeUtc } from "@/lib/server/earthquakes/types";

/**
 * Parses CWA's OriginTime, which arrives in two different shapes.
 *
 * It used to be "yyyy-MM-dd HH:mm:ss" — Taipei local time with no offset marker
 * — so a "+08:00" had to be appended, or Date would read it in the process's own
 * (UTC) timezone and shift every event eight hours. CWA now emits full ISO-8601
 * with the offset already attached: "2026-08-22T11:40:15+08:00".
 *
 * Appending unconditionally turned that into "...+08:00+08:00", an Invalid Date,
 * and toMysqlDatetimeUtc threw `RangeError: Invalid time value` on the very
 * first record. runSource isolates each source, so CWA failed silently while
 * USGS, EMSC and HKO carried on — the earthquake page stayed full of global M6+
 * events while every Taiwan M4-6 report was missing, including the M5.1 off the
 * east coast on 2026-08-22 that prompted this.
 *
 * Both shapes are accepted now, and an unparseable value names itself instead of
 * throwing a bare "Invalid time value".
 */
const parseCwaOriginTime = (originTime: string): Date => {
  const raw = originTime.trim();
  // A trailing offset (+08:00 / Z) means CWA already supplied a complete
  // timestamp; only the bare legacy form needs one added.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasOffset ? raw : `${raw.replace(" ", "T")}+08:00`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`CWA OriginTime could not be parsed: "${originTime}"`);
  }
  return parsed;
};

/**
 * Adapts CWA's 地震報告 (significant earthquake reports, E-A0015-001) into
 * the same IncomingEarthquake shape the USGS/EMSC/HKO adapters produce, so
 * upsertEarthquake's fuzzy cross-source match/merge applies here too — a
 * Taiwan-area quake that both CWA and USGS report lands as one row instead
 * of two, with sources_json.cwa marking it as CWA-covered for the M4.0+
 * display tier (see getTieredEarthquakes).
 */
export async function fetchCwaEarthquakesAsIncoming(): Promise<
  IncomingEarthquake[]
> {
  const records = await fetchCwaEarthquakes();

  return records
    .filter(
      (r) =>
        r.originTime != null &&
        r.epicenterLat != null &&
        r.epicenterLng != null,
    )
    .map((r): IncomingEarthquake => ({
      source: "cwa",
      sourceEventId: String(r.earthquakeNo),
      eventTime: toMysqlDatetimeUtc(parseCwaOriginTime(r.originTime as string)),
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
