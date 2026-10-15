import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { IncomingGdacsEvent } from "@/lib/server/gdacs/types";

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
