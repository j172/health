import type { RowDataPacket } from "mysql2/promise";
import { withConnection, withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { memoizeQuery } from "@/lib/server/cache/memo";
import type { IncomingConflictEvent } from "@/lib/server/gdelt/types";

/**
 * Upserts a batch of conflict events keyed by (source, source_event_id) —
 * matches conflict_events' UNIQUE KEY in schema.ts (issue #774, parent
 * #773). Every column except the key is overwritten on every sync (same
 * convention as upsertGdacsEvents in lib/server/gdacs/queries.ts) — GDELT's
 * export is a rolling 15-minute window, not a diff, but re-ingesting the
 * same GLOBALEVENTID twice (e.g. two consecutive sync ticks whose windows
 * overlap at the edge) must update the existing row in place, never insert
 * a second one.
 */
export const upsertConflictEvents = async (
  events: IncomingConflictEvent[],
): Promise<{ inserted: number; updated: number }> => {
  if (events.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    events,
    `
    INSERT INTO conflict_events
      (source, source_event_id, event_date, country_iso, country_name, lat, lng,
       fatalities_estimate, event_type_label, description, source_url,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      event_date = VALUES(event_date),
      country_iso = VALUES(country_iso),
      country_name = VALUES(country_name),
      lat = VALUES(lat),
      lng = VALUES(lng),
      fatalities_estimate = VALUES(fatalities_estimate),
      event_type_label = VALUES(event_type_label),
      description = VALUES(description),
      source_url = VALUES(source_url),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (e, now) => [
      e.source,
      e.sourceEventId,
      e.eventDate,
      e.countryIso,
      e.countryName,
      e.lat,
      e.lng,
      e.fatalitiesEstimate,
      e.rootCode,
      e.description,
      e.sourceUrl,
      now,
      now,
      now,
    ],
  );
};

/**
 * Deletes GDELT-sourced events older than `retentionDays` (by event_date,
 * never by any sync timestamp). Scoped to `source = 'gdelt'` so a future
 * UCDP sync (#775) can have its own, independently-decided retention policy
 * without this cleanup touching its rows. The item's own UI only ever shows
 * "目前相關的" recent events (#773's spec: "No historical/archival browsing
 * UI"), so unbounded growth here would only ever be dead weight, not a
 * feature anyone reads — same rationale as cleanupEndedGdacsEvents in
 * lib/server/gdacs/queries.ts.
 */
export const cleanupOldConflictEvents = async (retentionDays = 30): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM conflict_events WHERE source = 'gdelt' AND event_date < DATE_SUB(UTC_DATE(), INTERVAL ? DAY)`,
      [retentionDays],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

/** One GDELT-sourced conflict_events row, shaped for
 * lib/tools/globeWatch/conflictsTransform.ts's `ConflictEventRow` (mapped
 * from snake_case DB columns to camelCase, same convention as
 * lib/server/gdacs/queries.ts's GdacsDisasterEventRow). */
export interface GdeltConflictEventRow {
  sourceEventId: string;
  /** "YYYY-MM-DD". */
  eventDate: string;
  countryIso: string | null;
  countryName: string | null;
  lat: number;
  lng: number;
  fatalitiesEstimate: number | null;
  /** The raw CAMEO root code ("19"/"20") — see
   * lib/tools/globeWatch/conflictCameoRootNames.ts for localization. */
  rootCode: string;
  description: string;
  sourceUrl: string | null;
}

const mapConflictEventRow = (row: RowDataPacket): GdeltConflictEventRow => ({
  sourceEventId: row.source_event_id,
  eventDate: row.event_date instanceof Date ? row.event_date.toISOString().slice(0, 10) : String(row.event_date),
  countryIso: row.country_iso ?? null,
  countryName: row.country_name ?? null,
  lat: Number(row.lat),
  lng: Number(row.lng),
  fatalitiesEstimate: row.fatalities_estimate != null ? Number(row.fatalities_estimate) : null,
  rootCode: row.event_type_label,
  description: row.description,
  sourceUrl: row.source_url ?? null,
});

/**
 * Issue #774 (parent #773) — fetches every GDELT-sourced conflict event
 * from the last `lookbackDays` days (the "武裝衝突" item's data source;
 * `source = 'gdelt'` is the SQL-level filter, same defense-in-depth
 * convention as getCurrentGdacsDisasterEvents' EQ/TC exclusion). Memoized
 * for 60s (same convention as lib/server/gdacs/queries.ts) since this is
 * read on every /tools/global-watch/conflicts page render. Degrades to an
 * empty array on a DB error via withConnectionFallback, rather than taking
 * the whole page down — a conflicts-layer outage must never cascade into
 * the rest of Global Watch.
 */
export const getCurrentGdeltConflictEvents = async (lookbackDays = 30): Promise<GdeltConflictEventRow[]> =>
  memoizeQuery(`conflict_events_gdelt_${lookbackDays}`, async () =>
    withConnectionFallback([], async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT source_event_id, event_date, country_iso, country_name, lat, lng,
                fatalities_estimate, event_type_label, description, source_url
         FROM conflict_events
         WHERE source = 'gdelt'
           AND event_date >= DATE_SUB(UTC_DATE(), INTERVAL ? DAY)
         ORDER BY event_date DESC`,
        [lookbackDays],
      );
      return rows.map(mapConflictEventRow);
    }),
  );
