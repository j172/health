// GDACS (Global Disaster Alert and Coordination System) shared types.
// See lib/server/gdacs/sources/gdacs.ts for the fetch+parse module and
// lib/server/db/schema.ts (gdacsEvents) for the table these feed.

/** GDACS's own disaster-type codes, as returned in `properties.eventtype`. */
export type GdacsEventType = "EQ" | "TC" | "FL" | "VO" | "DR" | "WF";

/** GDACS's three-tier alert color, as returned in `properties.alertlevel`. */
export type GdacsAlertLevel = "Green" | "Orange" | "Red";

/**
 * One parsed GDACS event row, ready for upsertGdacsEvents(). Mirrors
 * gdacs_events' columns directly (see schema.ts) rather than GDACS's raw
 * property names, since GDACS's JSON uses inconsistent casing
 * (`eventtype`, `eventid`, `episodeid` all lower-case, no separators).
 */
export interface IncomingGdacsEvent {
  eventType: GdacsEventType;
  /** GDACS's `eventid` — stable across episodes of the same disaster. */
  eventId: string;
  /** GDACS's `episodeid` — increments as the same event is reassessed. */
  episodeId: string;
  alertLevel: GdacsAlertLevel;
  alertScore: number | null;
  /** ISO 3166-1 alpha-3 country code (GDACS's `iso3`), e.g. "TWN". */
  countryIso: string | null;
  lat: number;
  lng: number;
  /** MySQL DATETIME string (UTC), from GDACS's `fromdate`. */
  startTime: string | null;
  /** MySQL DATETIME string (UTC), from GDACS's `todate`. Null = still ongoing. */
  endTime: string | null;
  /** Original-language (always English for GDACS) title — GDACS's `name`. */
  title: string;
  reportUrl: string | null;
  /**
   * TC-only: the ocean basin the cyclone's centroid falls in. GDACS's API
   * does not supply this itself (confirmed by grepping a live payload for
   * "basin" — absent), so it's derived from lat/lng by deriveTcBasin().
   * Null for every non-TC event type.
   */
  basin: string | null;
  /**
   * TC-only: a trimmed GeoJSON FeatureCollection of the storm's track
   * (LineString segments + current-position point), fetched separately
   * from GDACS's getgeometry endpoint. Null for every non-TC event type,
   * and also null for a TC event if the track fetch failed or hasn't been
   * attempted — this must never abort the rest of the sync (see runSync.ts).
   */
  trackGeoJson: Record<string, unknown> | null;
}

export const toMysqlDatetimeUtc = (date: Date): string =>
  date.toISOString().slice(0, 19).replace("T", " ");
