import type { RowDataPacket } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { memoizeQuery } from "@/lib/server/cache/memo";
import type { GdacsAlertLevel, IncomingGdacsEvent } from "@/lib/server/gdacs/types";

/**
 * Upserts a batch of GDACS events keyed by (event_type, event_id) — matches
 * gdacs_events' UNIQUE KEY in schema.ts. GDACS's event list always reports
 * the *current* state of an event (not a diff), so every column is
 * overwritten on every sync, including episode_id — there's no "only
 * advance forward" check, because GDACS re-publishing an older episode
 * number for an event it still considers current has never been observed
 * and isn't a state this parser needs to defend against; the issue's
 * "episode 更新同一列" requirement is exactly this: the same (event_type,
 * event_id) row gets ON DUPLICATE KEY UPDATE'd in place as the episode
 * advances, never a new row.
 */
export const upsertGdacsEvents = async (
  events: IncomingGdacsEvent[],
): Promise<{ inserted: number; updated: number }> => {
  if (events.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    events,
    `
    INSERT INTO gdacs_events
      (event_type, event_id, episode_id, alert_level, alert_score, country_iso,
       lat, lng, start_time, end_time, title, report_url, basin, track_geojson,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      episode_id = VALUES(episode_id),
      alert_level = VALUES(alert_level),
      alert_score = VALUES(alert_score),
      country_iso = VALUES(country_iso),
      lat = VALUES(lat),
      lng = VALUES(lng),
      start_time = VALUES(start_time),
      end_time = VALUES(end_time),
      title = VALUES(title),
      report_url = VALUES(report_url),
      basin = VALUES(basin),
      track_geojson = VALUES(track_geojson),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (e, now) => [
      e.eventType,
      e.eventId,
      e.episodeId,
      e.alertLevel,
      e.alertScore,
      e.countryIso,
      e.lat,
      e.lng,
      e.startTime,
      e.endTime,
      e.title,
      e.reportUrl,
      e.basin,
      e.trackGeoJson ? JSON.stringify(e.trackGeoJson) : null,
      now,
      now,
      now,
    ],
  );
};

/**
 * Deletes events that ended more than `retentionDays` ago. An event with no
 * end_time (still ongoing, per GDACS) is never a cleanup candidate however
 * old it is — only `end_time IS NOT NULL` rows are considered, so a
 * long-running drought that's still active is kept regardless of
 * `start_time`'s age. Returns the number of rows removed, for logging.
 */
export const cleanupEndedGdacsEvents = async (retentionDays = 30): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM gdacs_events WHERE end_time IS NOT NULL AND end_time < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

/** A GDACS EQ-type event row, shaped for
 * lib/tools/globeWatch/earthquakeGlobeFeatures.ts's `GdacsEqEventRow` (this
 * file's output is this app's own naming/casing, matching that pure
 * module's input contract field-for-field so callers never need an
 * intermediate mapping step). */
export interface RecentGdacsEqEvent {
  eventId: string;
  alertLevel: GdacsAlertLevel;
  lat: number;
  lng: number;
  startTime: Date | null;
  reportUrl: string | null;
}

interface GdacsEqEventRowPacket extends RowDataPacket {
  event_id: string;
  alert_level: GdacsAlertLevel;
  lat: number;
  lng: number;
  start_time: Date | null;
  report_url: string | null;
}

/**
 * Fetches GDACS events of type EQ from the last `lookbackDays` days, for
 * the earthquake item's globe-marker severity overlay (issue #595) — the
 * first read query this file has needed (upsertGdacsEvents and
 * cleanupEndedGdacsEvents are both writes). The actual earthquake↔GDACS
 * matching (time/distance tolerance) happens entirely in
 * lib/tools/globeWatch/earthquakeGlobeFeatures.ts's matchGdacsEqEvent, a
 * pure function with no DB access — this function's only job is fetching
 * candidates for it to match against.
 *
 * `lookbackDays` defaults wider (10 days) than both the globe's own 7-day
 * earthquake lookback (GLOBE_EARTHQUAKE_LOOKBACK_HOURS) and the matcher's
 * own time tolerance (GDACS_EQ_MATCH_TIME_WINDOW_HOURS, 6h) combined, so a
 * GDACS event whose `start_time` lands just outside the earthquake
 * lookback window is never excluded from the candidate set — the matcher
 * itself still enforces the real 6-hour tolerance per earthquake.
 *
 * Uses `withConnectionFallback([], ...)` (not `withConnection`), the same
 * degrade-to-empty convention `getTieredEarthquakes`/
 * `getGlobeWatchEarthquakeCandidates` already use — a GDACS read failure
 * must never take down the earthquake item's page, since the severity
 * overlay this feeds is purely additive (AC: an unmatched earthquake simply
 * keeps its magnitude-based color).
 */
export const getRecentEqGdacsEvents = async (lookbackDays = 10): Promise<RecentGdacsEqEvent[]> =>
  memoizeQuery(`gdacs_recent_eq_${lookbackDays}`, async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<GdacsEqEventRowPacket[]>(
        `SELECT event_id, alert_level, lat, lng, start_time, report_url
         FROM gdacs_events
         WHERE event_type = 'EQ'
           AND (start_time IS NULL OR start_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY))`,
        [lookbackDays],
      );
      return rows.map((row) => ({
        eventId: row.event_id,
        alertLevel: row.alert_level,
        lat: Number(row.lat),
        lng: Number(row.lng),
        startTime: row.start_time,
        reportUrl: row.report_url,
      }));
    }),
  );
