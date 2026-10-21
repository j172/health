// GDELT 2.0 Event Database shared types — issue #774 (parent #773). See
// lib/server/gdelt/sources/gdelt.ts for the fetch+parse module and
// lib/server/db/schema.ts (conflictEvents) for the table this feeds.

/**
 * One parsed GDELT conflict-event row, ready for upsertConflictEvents() (see
 * lib/server/conflicts/queries.ts). Mirrors conflict_events' columns
 * directly, not GDELT's own 61-column positional TSV schema — see
 * lib/server/gdelt/sources/gdelt.ts's own doc comment for the column-index
 * mapping.
 */
export interface IncomingConflictEvent {
  source: "gdelt";
  /** GDELT's own GLOBALEVENTID — a permanent, never-reused event identifier
   * (matches conflict_events.source_event_id). */
  sourceEventId: string;
  /** MySQL DATE string ("YYYY-MM-DD"), from GDELT's SQLDATE (YYYYMMDD). */
  eventDate: string;
  /** GDELT's ActionGeo_CountryCode — a FIPS 10-4 code, NOT true ISO 3166-1
   * (the two coincide for most countries but not all — see schema.ts's own
   * comment on conflict_events.country_iso for the known gap). Null when
   * GDELT didn't resolve a country for this event's action location. */
  countryIso: string | null;
  /** GDELT's ActionGeo_FullName — a human-readable place name (e.g. "Kyiv,
   * Kyiv, Ukraine"), more informative than the bare country code alone. */
  countryName: string | null;
  lat: number;
  lng: number;
  /** Always null for GDELT — it has no reliable casualty-count field (see
   * #773's spec: "GDELT doesn't reliably" have this). Kept on this shared
   * type so a future UCDP row (#775, which does have `best_est`) can
   * populate it without a type change. */
  fatalitiesEstimate: null;
  /** The CAMEO root code itself ("19" or "20") — not yet localized; see
   * lib/tools/globeWatch/conflictCameoRootNames.ts for the render-time
   * localization. */
  rootCode: "19" | "20";
  /** Short, already-truncated description built from the event's actors and
   * location (GDELT's event rows carry no headline of their own — that
   * lives in its separate GKG/mentions files, which this pipeline doesn't
   * fetch). */
  description: string;
  /** GDELT's SOURCEURL — the original news article this event was coded
   * from; this is the "連回原始來源的連結" the spec requires, distinct from
   * the GDELT Project citation link itself (which points at
   * gdeltproject.org, not at any one article). */
  sourceUrl: string | null;
}

export const toMysqlDateUtc = (sqlDate: string): string | null => {
  // GDELT's SQLDATE is always an 8-digit YYYYMMDD string, already in UTC.
  if (!/^\d{8}$/.test(sqlDate)) return null;
  const year = sqlDate.slice(0, 4);
  const month = sqlDate.slice(4, 6);
  const day = sqlDate.slice(6, 8);
  return `${year}-${month}-${day}`;
};
