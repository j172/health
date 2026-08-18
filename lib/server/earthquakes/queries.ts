import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { IncomingEarthquake } from "@/lib/server/earthquakes/types";

// No source's event ID is usable as a cross-source key (USGS/EMSC/HKO each
// mint their own), so "is this the same earthquake we already have" is a
// fuzzy match instead of a database UNIQUE KEY — tuned against a real
// same-event pair observed live (USGS ci40663114 / EMSC 20260729_0000208,
// exact same lat/lng/depth/magnitude, ~1 min apart in origin time), with
// slack added for cases where different networks' picks disagree more.
const MATCH_TIME_WINDOW_SECONDS = 120;
const MATCH_DISTANCE_KM = 150;
const MATCH_MAGNITUDE_TOLERANCE = 0.6;

interface ExistingMatch extends RowDataPacket {
  id: number;
  sources_json: Record<string, unknown> | null;
  place_zh: string | null;
  tsunami_warning: number;
  // DECIMAL column — mysql2 returns this as a string, not a number, since
  // the pool isn't configured with decimalNumbers:true (see mapEarthquakeRow
  // below, which parses it the same way for the same reason).
  magnitude: string | number | null;
  primary_source: string;
}

// Display attribution rule (see getTieredEarthquakes): M6.0+ events are
// attributed to USGS, M4.0+ CWA-covered events to CWA. Re-run on every
// merge (not just at insert) so primary_source reflects this regardless of
// which source happened to report the event first — e.g. a Taiwan quake
// CWA flashes out within seconds still ends up attributed to USGS once USGS
// catches up, if it clears M6.0.
const resolvePrimarySource = (mergedMagnitude: string | number | null, sources: Record<string, unknown>, fallback: string): string => {
  const mag = mergedMagnitude == null ? NaN : Number(mergedMagnitude);
  if (!isNaN(mag) && mag >= 6.0 && sources.usgs) return "usgs";
  if (sources.cwa) return "cwa";
  return fallback;
};

/**
 * Matches an incoming earthquake against existing rows (time/distance/
 * magnitude tolerance) and either merges it into that row (adds this
 * source's contribution to sources_json, fills in place_zh if this source
 * has one and the row didn't) or inserts a new row if nothing matches.
 * Idempotent for repeated sightings of the same event from the same source
 * across polls — same mechanism handles both "same event from a different
 * agency" and "same event re-fetched from the same feed".
 */
export const upsertEarthquake = async (event: IncomingEarthquake): Promise<"inserted" | "matched"> =>
  withConnection(async (conn) => {
    const magnitudeClause = event.magnitude != null ? "AND ABS(magnitude - ?) <= ?" : "";
    const magnitudeParams = event.magnitude != null ? [event.magnitude, MATCH_MAGNITUDE_TOLERANCE] : [];

    const [matches] = await conn.query<ExistingMatch[]>(
      `SELECT id, sources_json, place_zh, tsunami_warning, magnitude, primary_source
       FROM global_earthquakes
       WHERE ABS(TIMESTAMPDIFF(SECOND, event_time, ?)) <= ?
         ${magnitudeClause}
         AND (6371 * acos(
              LEAST(1, GREATEST(-1,
                cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) +
                sin(radians(?)) * sin(radians(lat))
              ))
            )) <= ?
       ORDER BY ABS(TIMESTAMPDIFF(SECOND, event_time, ?)) ASC
       LIMIT 1`,
      [event.eventTime, MATCH_TIME_WINDOW_SECONDS, ...magnitudeParams, event.lat, event.lng, event.lat, MATCH_DISTANCE_KM, event.eventTime],
    );

    const now = utcNowSql();

    if (matches.length > 0) {
      const existing = matches[0];
      // mysql2 auto-deserializes JSON columns into objects already — this
      // isn't a JSON *string* to parse, unlike most of this field's other
      // uses (e.g. facilities.extra_json is written with JSON.stringify but
      // never read back parsed like this elsewhere in the codebase).
      const sources: Record<string, unknown> = existing.sources_json ?? {};
      sources[event.source] = { id: event.sourceEventId, mag: event.magnitude, url: event.url };
      const placeZh = existing.place_zh ?? event.placeZh;
      const tsunami = existing.tsunami_warning === 1 || event.tsunamiWarning ? 1 : 0;
      const primarySource = resolvePrimarySource(existing.magnitude, sources, existing.primary_source);

      await conn.query(
        "UPDATE global_earthquakes SET sources_json = ?, place_zh = ?, tsunami_warning = ?, primary_source = ?, synced_at = ?, updated_at = ? WHERE id = ?",
        [JSON.stringify(sources), placeZh, tsunami, primarySource, now, now, existing.id],
      );
      return "matched";
    }

    await conn.query(
      `INSERT INTO global_earthquakes
         (event_time, magnitude, magnitude_type, depth_km, lat, lng, place, place_zh, tsunami_warning, primary_source, sources_json, url, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventTime,
        event.magnitude,
        event.magnitudeType,
        event.depthKm,
        event.lat,
        event.lng,
        event.place,
        event.placeZh,
        event.tsunamiWarning ? 1 : 0,
        event.source,
        JSON.stringify({ [event.source]: { id: event.sourceEventId, mag: event.magnitude, url: event.url } }),
        event.url,
        now,
        now,
        now,
      ],
    );
    return "inserted";
  });

export interface SignificantEarthquake {
  id: number;
  event_time: Date | string;
  magnitude: number;
  depth_km: number | null;
  place: string | null;
  place_zh: string | null;
  tsunami_warning: number;
  primary_source: string | null;
  url: string | null;
}

import { memoizeQuery } from "@/lib/server/cache/memo";

const mapEarthquakeRow = (r: RowDataPacket): SignificantEarthquake => ({
  id: Number(r.id),
  event_time: r.event_time instanceof Date ? r.event_time.toISOString() : String(r.event_time ?? ""),
  magnitude: isNaN(Number(r.magnitude)) ? 0 : Number(r.magnitude),
  depth_km: r.depth_km != null && !isNaN(Number(r.depth_km)) ? Number(r.depth_km) : null,
  place: r.place ? String(r.place) : null,
  place_zh: r.place_zh ? String(r.place_zh) : null,
  tsunami_warning: Number(r.tsunami_warning ?? 0),
  primary_source: r.primary_source ? String(r.primary_source) : null,
  url: r.url ? String(r.url) : null,
});

/** Recent earthquakes worldwide at or above minMagnitude, most recent first. */
export const getRecentSignificantEarthquakes = async (minMagnitude = 6.0, hours = 168, limit = 20): Promise<SignificantEarthquake[]> =>
  memoizeQuery(`earthquakes_${minMagnitude}_${hours}_${limit}`, async () =>
    withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, event_time, magnitude, depth_km, place, place_zh, tsunami_warning, primary_source, url
         FROM global_earthquakes
         WHERE magnitude >= ?
           AND event_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
         ORDER BY event_time DESC
         LIMIT ?`,
        [minMagnitude, hours, limit],
      );
      return rows.map(mapEarthquakeRow);
    }),
  );

/**
 * Recent earthquakes under the site's two-tier display rule: worldwide
 * M6.0+ (USGS-anchored) plus Taiwan-area M4.0+ events CWA has issued a
 * report for (sources_json.cwa present) — everything else (e.g. a M5.1
 * outside Taiwan that only EMSC/HKO saw) is intentionally excluded. Most
 * recent first. Used by both the earthquakes tool page and the news
 * sidebar widget.
 */
export const getTieredEarthquakes = async (hours = 168, limit = 50): Promise<SignificantEarthquake[]> =>
  memoizeQuery(`earthquakes_tiered_${hours}_${limit}`, async () =>
    withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, event_time, magnitude, depth_km, place, place_zh, tsunami_warning, primary_source, url
         FROM global_earthquakes
         WHERE event_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
           AND (
             magnitude >= 6.0
             OR (magnitude >= 4.0 AND JSON_CONTAINS_PATH(sources_json, 'one', '$.cwa'))
           )
         ORDER BY event_time DESC
         LIMIT ?`,
        [hours, limit],
      );
      return rows.map(mapEarthquakeRow);
    }),
  );
