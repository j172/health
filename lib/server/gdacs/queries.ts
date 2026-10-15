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

/** GDACS event-type codes the "全球災害" (disasters) item shows — see
 * lib/tools/globeWatch/disastersTransform.ts for why EQ/TC are excluded. */
const DISASTER_EVENT_TYPES = ["FL", "VO", "DR", "WF"] as const;

/** Row shape returned by getCurrentGdacsDisasterEvents() — mirrors the
 * gdacs_events columns the disasters item's pure transform module
 * (lib/tools/globeWatch/disastersTransform.ts) actually needs, mapped from
 * snake_case DB columns to camelCase. */
export interface GdacsDisasterEventRow {
  eventType: string;
  eventId: string;
  alertLevel: string;
  countryIso: string | null;
  lat: number;
  lng: number;
  startTime: string | null;
  endTime: string | null;
  title: string;
  reportUrl: string | null;
}

const mapDisasterEventRow = (row: RowDataPacket): GdacsDisasterEventRow => ({
  eventType: row.event_type,
  eventId: row.event_id,
  alertLevel: row.alert_level,
  countryIso: row.country_iso ?? null,
  lat: Number(row.lat),
  lng: Number(row.lng),
  startTime: row.start_time ? new Date(row.start_time).toISOString() : null,
  endTime: row.end_time ? new Date(row.end_time).toISOString() : null,
  title: row.title,
  reportUrl: row.report_url ?? null,
});

/**
 * Issue #594 (parent #583) — fetches every currently-active FL/VO/DR/WF
 * event (the "全球災害" item's data source): "currently active" means
 * `end_time IS NULL` (still ongoing, per GDACS) or `end_time` hasn't passed
 * yet, same "ongoing" semantics cleanupEndedGdacsEvents() already uses for
 * retention. EQ/TC are excluded at the SQL level (defense in depth — the
 * pure transform module filters them again too). Memoized for 60s (same
 * convention as lib/server/earthquakes/queries.ts) since this is read on
 * every /tools/global-watch/disasters page render.
 */
export const getCurrentGdacsDisasterEvents = async (): Promise<GdacsDisasterEventRow[]> =>
  memoizeQuery("gdacs_disaster_events_current", async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT event_type, event_id, alert_level, country_iso, lat, lng, start_time, end_time, title, report_url
         FROM gdacs_events
         WHERE event_type IN (?, ?, ?, ?)
           AND (end_time IS NULL OR end_time >= UTC_TIMESTAMP())
         ORDER BY start_time DESC`,
        [...DISASTER_EVENT_TYPES],
      );
      return rows.map(mapDisasterEventRow);
    }),
  );

/** One active TC (tropical cyclone) event row, as read back from
 * gdacs_events for the global-watch 颱風 item. */
export interface GdacsTcEventRow {
  event_id: string;
  episode_id: string;
  alert_level: GdacsAlertLevel;
  alert_score: number | null;
  country_iso: string | null;
  lat: number;
  lng: number;
  start_time: Date | null;
  end_time: Date | null;
  title: string;
  report_url: string | null;
  basin: string | null;
  /** mysql2 auto-parses JSON-typed columns into a plain object (same
   * convention `sources_json` on `global_earthquakes` already relies on —
   * see lib/server/earthquakes/queries.ts), so this arrives already parsed. */
  track_geojson: Record<string, unknown> | null;
}

/**
 * Issue #593 (parent #583): active TC events for the global-watch 颱風
 * item's non-West-Pacific data (lib/tools/globeWatch/typhoonsTransform.ts
 * drops any row here whose own `basin` is "WP", since CWA alone covers that
 * basin — see that module's doc comment). "Active" means GDACS still
 * considers the event ongoing (`end_time IS NULL`) or its stated end time
 * hasn't passed yet; an event with no `end_time` is never excluded by age,
 * matching cleanupEndedGdacsEvents' own "only end_time IS NOT NULL rows are
 * cleanup candidates" rule.
 */
export const listActiveTcEvents = async (): Promise<GdacsTcEventRow[]> =>
  memoizeQuery("gdacs_active_tc_events", async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `
        SELECT event_id, episode_id, alert_level, alert_score, country_iso, lat, lng,
               start_time, end_time, title, report_url, basin, track_geojson
        FROM gdacs_events
        WHERE event_type = 'TC'
          AND (end_time IS NULL OR end_time > UTC_TIMESTAMP())
        ORDER BY start_time DESC
        `,
      );
      return rows.map((r) => ({
        event_id: String(r.event_id),
        episode_id: String(r.episode_id),
        alert_level: r.alert_level as GdacsAlertLevel,
        alert_score: r.alert_score != null ? Number(r.alert_score) : null,
        country_iso: r.country_iso ?? null,
        lat: Number(r.lat),
        lng: Number(r.lng),
        start_time: r.start_time ?? null,
        end_time: r.end_time ?? null,
        title: String(r.title),
        report_url: r.report_url ?? null,
        basin: r.basin ?? null,
        track_geojson: (r.track_geojson as Record<string, unknown> | null) ?? null,
      })) as GdacsTcEventRow[];
    }),
  );
