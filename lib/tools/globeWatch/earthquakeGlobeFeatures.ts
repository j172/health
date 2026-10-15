/**
 * Issue #588 (parent #583): the "項目 → 地球資料" pure-logic seam for the
 * earthquake item — pure, browser-free, independently testable (no DB, no
 * DOM, no MapLibre), following the same convention as
 * lib/tools/globeWatch/{basemapLabels,motion,webgl}.ts from #587.
 *
 * Two independent display rules exist side by side on purpose (#583's
 * decision):
 * - The server-rendered LIST keeps the existing "顯著地震" rule unchanged:
 *   worldwide M6.0+ or CWA-covered M4.0+ (see
 *   lib/server/earthquakes/queries.ts's getTieredEarthquakes — untouched by
 *   this ticket).
 * - The GLOBE markers use a wider, independent threshold: worldwide M4.5+ OR
 *   any CWA-sourced M4.0+, within the last 7 days — computed here, from a
 *   superset of candidate rows the DB query fetches (see
 *   getGlobeWatchEarthquakeCandidates), not from the list's own rows.
 *
 * The 7-day cutoff is enforced HERE (not left to the SQL query's own time
 * window) specifically so this module's own fixture-based tests can prove
 * "an event older than 7 days doesn't make it onto the globe" without a
 * database in the loop.
 *
 * Issue #595 (parent #583, blocked by #588/#592 — both merged): adds an
 * optional GDACS EQ severity overlay on top of the markers this module
 * already builds. This does NOT change the globe threshold, the list rule,
 * or the M4/M6/M7 UI filter above — it only attaches an extra
 * `gdacsAlertLevel`/`gdacsColor` pair to a feature when a GDACS EQ-type
 * event (from gdacs_events, already fetched by the caller — see
 * lib/server/gdacs/queries.ts's getRecentEqGdacsEvents) matches it.
 */

export const GLOBE_EARTHQUAKE_LOOKBACK_HOURS = 24 * 7;
export const GLOBE_MIN_MAGNITUDE_WORLDWIDE = 4.5;
export const GLOBE_MIN_MAGNITUDE_CWA = 4.0;

/** Input row shape this module consumes — intentionally its own type (not
 * `SignificantEarthquake`) since the globe needs `lat`/`lng` and a
 * `cwaSourced` flag the list's rows never carry. */
export interface EarthquakeGlobeRow {
  id: number | string;
  /** ISO 8601 string or Date — UTC. */
  eventTime: string | Date;
  magnitude: number | null;
  depthKm: number | null;
  lat: number;
  lng: number;
  place: string | null;
  placeZh: string | null;
  tsunamiWarning: boolean;
  primarySource: string | null;
  url: string | null;
  /** True when this event's `sources_json` includes a CWA report (see
   * lib/server/earthquakes/queries.ts's getGlobeWatchEarthquakeCandidates). */
  cwaSourced: boolean;
}

export interface MagnitudeBucket {
  key: "m4" | "m5" | "m6" | "m7";
  minMagnitude: number;
  /** Marker fill color (hex), scaled by magnitude. */
  color: string;
  /** Marker circle radius in CSS pixels, scaled by magnitude. */
  radiusPx: number;
  labelDefault: string;
}

/** Magnitude → marker size/color ladder (AC: "標記大小/顏色依規模分級"), ordered
 * highest-minMagnitude-first so `resolveMagnitudeBucket` can pick the first
 * match. Also doubles as this item's globe legend. */
export const EARTHQUAKE_MAGNITUDE_BUCKETS: MagnitudeBucket[] = [
  { key: "m7", minMagnitude: 7.0, color: "#ef4444", radiusPx: 13, labelDefault: "M7.0+" },
  { key: "m6", minMagnitude: 6.0, color: "#f97316", radiusPx: 10, labelDefault: "M6.0–6.9" },
  { key: "m5", minMagnitude: 5.0, color: "#f59e0b", radiusPx: 8, labelDefault: "M5.0–5.9" },
  { key: "m4", minMagnitude: 0, color: "#6366f1", radiusPx: 6, labelDefault: "M4.0–4.9" },
];

/** Same ladder, exported under the name the globe legend UI reads — kept as
 * a separate alias (not just reusing `EARTHQUAKE_MAGNITUDE_BUCKETS` inline
 * everywhere) so a future per-item legend shape change doesn't have to touch
 * every call site that only cares about marker styling. */
export const EARTHQUAKE_GLOBE_LEGEND = EARTHQUAKE_MAGNITUDE_BUCKETS;

export function resolveMagnitudeBucket(magnitude: number): MagnitudeBucket {
  return (
    EARTHQUAKE_MAGNITUDE_BUCKETS.find((bucket) => magnitude >= bucket.minMagnitude) ??
    EARTHQUAKE_MAGNITUDE_BUCKETS[EARTHQUAKE_MAGNITUDE_BUCKETS.length - 1]
  );
}

const toEpochMs = (value: string | Date): number => {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/** True when `eventTime` falls within the globe's 7-day lookback window, relative to `now`. */
export function isWithinGlobeLookback(eventTime: string | Date, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - toEpochMs(eventTime);
  return ageMs >= 0 && ageMs <= GLOBE_EARTHQUAKE_LOOKBACK_HOURS * 60 * 60 * 1000;
}

/**
 * The globe's own, wider threshold (AC #2/#3 of issue #588): worldwide
 * M4.5+, OR any CWA-sourced M4.0+, within the last 7 days. Independent of
 * the list's "顯著地震" rule and of any UI magnitude-filter tier — callers
 * apply the M4/M6/M7 filter on top of this (see
 * buildEarthquakeGlobeFeatureCollection's `minMagnitude` option).
 */
export function isGlobeEarthquake(row: EarthquakeGlobeRow, now: Date = new Date()): boolean {
  const mag = typeof row.magnitude === "number" ? row.magnitude : Number(row.magnitude);
  if (Number.isNaN(mag)) return false;
  if (!isWithinGlobeLookback(row.eventTime, now)) return false;
  if (mag >= GLOBE_MIN_MAGNITUDE_WORLDWIDE) return true;
  return Boolean(row.cwaSourced) && mag >= GLOBE_MIN_MAGNITUDE_CWA;
}

export interface EarthquakeGlobeFeatureProperties {
  id: number | string;
  eventTime: string;
  magnitude: number;
  depthKm: number | null;
  place: string | null;
  placeZh: string | null;
  /** Prefers the Chinese place name when present (AC: "地點優先顯示中文地名"),
   * falling back to the raw (usually English/USGS) place string. */
  displayPlace: string | null;
  isTsunami: boolean;
  primarySource: string | null;
  url: string | null;
  cwaSourced: boolean;
  bucketKey: MagnitudeBucket["key"];
  markerColor: string;
  markerRadiusPx: number;
  /**
   * Issue #595: the matched GDACS EQ event's alert level, or `null` when no
   * GDACS event matched this earthquake — in which case the marker keeps
   * its original magnitude-based color (AC: "沒有對應事件的地震維持原本規模配色").
   */
  gdacsAlertLevel: GdacsEqAlertLevel | null;
  /** `GDACS_ALERT_LEVEL_COLORS[gdacsAlertLevel]`, or `null` when unmatched.
   * Kept as a precomputed color (rather than making the MapLibre paint
   * expression look up the level itself) so the globe layer only ever needs
   * `["coalesce", ["get", "gdacsColor"], ["get", "markerColor"]]` —
   * consistent with how `markerColor`/`markerRadiusPx` are already
   * precomputed above instead of derived in MapLibre expressions. */
  gdacsColor: string | null;
  /** The matched GDACS event's own event_id — null when unmatched. Not
   * currently rendered anywhere, but kept for a future "open the GDACS
   * report" link without re-matching. */
  gdacsEventId: string | null;
  /** The matched GDACS event's report URL — null when unmatched. */
  gdacsReportUrl: string | null;
}

export type EarthquakeGlobePointFeature = GeoJSON.Feature<GeoJSON.Point, EarthquakeGlobeFeatureProperties>;

export function toEarthquakeGlobeFeature(
  row: EarthquakeGlobeRow,
  gdacsMatch: GdacsEqEventRow | null = null,
): EarthquakeGlobePointFeature {
  const magnitude = typeof row.magnitude === "number" ? row.magnitude : Number(row.magnitude) || 0;
  const bucket = resolveMagnitudeBucket(magnitude);
  const eventTimeIso = row.eventTime instanceof Date ? row.eventTime.toISOString() : String(row.eventTime);

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties: {
      id: row.id,
      eventTime: eventTimeIso,
      magnitude,
      depthKm: row.depthKm,
      place: row.place,
      placeZh: row.placeZh,
      displayPlace: row.placeZh?.trim() || row.place?.trim() || null,
      isTsunami: Boolean(row.tsunamiWarning),
      primarySource: row.primarySource,
      url: row.url,
      cwaSourced: row.cwaSourced,
      bucketKey: bucket.key,
      markerColor: bucket.color,
      markerRadiusPx: bucket.radiusPx,
      gdacsAlertLevel: gdacsMatch?.alertLevel ?? null,
      gdacsColor: gdacsMatch ? GDACS_ALERT_LEVEL_COLORS[gdacsMatch.alertLevel] : null,
      gdacsEventId: gdacsMatch?.eventId ?? null,
      gdacsReportUrl: gdacsMatch?.reportUrl ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Issue #595: GDACS EQ severity-color overlay
// ---------------------------------------------------------------------------

/** Mirrors lib/server/gdacs/types.ts's `GdacsAlertLevel` — declared locally
 * (not imported) so this module stays what its header comment promises:
 * pure, with zero DB-layer coupling, even a type-only one. */
export type GdacsEqAlertLevel = "Green" | "Orange" | "Red";

/** GDACS's own three-tier severity color, as hex — this item's only use of
 * it (AC: "疊加 GDACS 的紅/橙/綠警戒色"). Exported so a future item (e.g. the
 * still-unbuilt "全球災害" item, #583's third tab) can reuse the exact same
 * mapping instead of inventing its own. */
export const GDACS_ALERT_LEVEL_COLORS: Record<GdacsEqAlertLevel, string> = {
  Green: "#22c55e",
  Orange: "#f97316",
  Red: "#dc2626",
};

/**
 * A GDACS event of type EQ, already fetched from `gdacs_events` by the
 * caller (see lib/server/gdacs/queries.ts's getRecentEqGdacsEvents) — this
 * module never queries the DB itself. Deliberately a narrower shape than
 * `IncomingGdacsEvent` (no episodeId/countryIso/basin/trackGeoJson, none of
 * which the earthquake-severity overlay needs).
 */
export interface GdacsEqEventRow {
  eventId: string;
  alertLevel: GdacsEqAlertLevel;
  lat: number;
  lng: number;
  /** GDACS's `fromdate` — ISO 8601 string, Date, or null (not expected in
   * practice for an EQ event, but tolerated the same way `endTime` is
   * elsewhere in this GDACS pipeline). */
  startTime: string | Date | null;
  reportUrl: string | null;
}

// Matching an earthquake row against a GDACS EQ event is the same kind of
// cross-source fuzzy match lib/server/earthquakes/queries.ts's
// upsertEarthquake already does for USGS/EMSC/CWA — no shared ID exists
// across GDACS and this app's own global_earthquakes rows, so "is this
// GDACS event reporting the same earthquake" is time + distance proximity,
// not an exact key join. The distance tolerance reuses upsertEarthquake's
// MATCH_DISTANCE_KM (150km) exactly, for the same reason it was tuned that
// way there: different networks' epicenter picks can disagree by tens of
// km. The time tolerance is deliberately much wider than upsertEarthquake's
// 120-second one (6 hours here) because GDACS only creates/updates an EQ
// event once its own significance assessment finishes, which can trail the
// originating network's report by hours — unlike USGS/EMSC/CWA, GDACS isn't
// polling the same near-real-time origin-time feed.
export const GDACS_EQ_MATCH_TIME_WINDOW_HOURS = 6;
export const GDACS_EQ_MATCH_DISTANCE_KM = 150;

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg: number): number => (deg * Math.PI) / 180;

const haversineDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, a)));
};

/**
 * Finds the best-matching GDACS EQ event for an earthquake row (closest in
 * time, among those within both the time and distance tolerance), or
 * `null` when none matches — the overlay is additive, so "no match" must
 * never throw or fall back to a guess. A GDACS event with a null
 * `startTime` never matches (there's nothing to compare).
 */
export function matchGdacsEqEvent(
  row: EarthquakeGlobeRow,
  gdacsEvents: GdacsEqEventRow[],
): GdacsEqEventRow | null {
  const rowTimeMs = toEpochMs(row.eventTime);
  let best: { event: GdacsEqEventRow; timeDiffMs: number } | null = null;

  for (const event of gdacsEvents) {
    if (event.startTime == null) continue;
    const eventTimeMs = toEpochMs(event.startTime);
    const timeDiffMs = Math.abs(rowTimeMs - eventTimeMs);
    if (timeDiffMs > GDACS_EQ_MATCH_TIME_WINDOW_HOURS * 60 * 60 * 1000) continue;

    const distanceKm = haversineDistanceKm(row.lat, row.lng, event.lat, event.lng);
    if (distanceKm > GDACS_EQ_MATCH_DISTANCE_KM) continue;

    if (!best || timeDiffMs < best.timeDiffMs) {
      best = { event, timeDiffMs };
    }
  }

  return best?.event ?? null;
}

export type EarthquakeGlobeFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  EarthquakeGlobeFeatureProperties
>;

/**
 * Builds the globe's earthquake FeatureCollection from a superset of
 * candidate rows: applies `isGlobeEarthquake`'s threshold/lookback rule,
 * then the shared M4/M6/M7 UI filter (`minMagnitude`, same tier the list
 * uses — AC: "M4/M6/M7 篩選同時套用在地球標記與清單"), then maps to GeoJSON
 * point features.
 *
 * `options.gdacsEvents` (issue #595) is applied strictly AFTER both of
 * those filters, purely as an extra per-feature color attachment — passing
 * it (or not) never changes which rows make it into the collection, only
 * whether a surviving feature additionally carries `gdacsAlertLevel`/
 * `gdacsColor` (AC: "不影響既有的規模篩選（M4/M6/M7）與清單規則").
 */
export function buildEarthquakeGlobeFeatureCollection(
  rows: EarthquakeGlobeRow[],
  options: { minMagnitude?: number; now?: Date; gdacsEvents?: GdacsEqEventRow[] } = {},
): EarthquakeGlobeFeatureCollection {
  const minMagnitude = options.minMagnitude ?? 0;
  const now = options.now ?? new Date();
  const gdacsEvents = options.gdacsEvents ?? [];

  const features = rows
    .filter((row) => isGlobeEarthquake(row, now))
    .filter((row) => {
      const mag = typeof row.magnitude === "number" ? row.magnitude : Number(row.magnitude);
      return !Number.isNaN(mag) && mag >= minMagnitude;
    })
    .map((row) => toEarthquakeGlobeFeature(row, gdacsEvents.length > 0 ? matchGdacsEqEvent(row, gdacsEvents) : null));

  return { type: "FeatureCollection", features };
}
