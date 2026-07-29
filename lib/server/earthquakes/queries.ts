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
}

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
      `SELECT id, sources_json, place_zh, tsunami_warning
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

      await conn.query("UPDATE global_earthquakes SET sources_json = ?, place_zh = ?, tsunami_warning = ?, synced_at = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(sources),
        placeZh,
        tsunami,
        now,
        now,
        existing.id,
      ]);
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
  event_time: Date;
  magnitude: number;
  place: string | null;
  place_zh: string | null;
  url: string | null;
}

/** Recent M6.0+ earthquakes worldwide, most recent first. */
export const getRecentSignificantEarthquakes = async (minMagnitude = 6.0, hours = 24, limit = 5): Promise<SignificantEarthquake[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, event_time, magnitude, place, place_zh, url
       FROM global_earthquakes
       WHERE magnitude >= ?
         AND event_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
       ORDER BY event_time DESC
       LIMIT ?`,
      [minMagnitude, hours, limit],
    );
    return rows as unknown as SignificantEarthquake[];
  });
