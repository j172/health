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
}

export type EarthquakeGlobePointFeature = GeoJSON.Feature<GeoJSON.Point, EarthquakeGlobeFeatureProperties>;

export function toEarthquakeGlobeFeature(row: EarthquakeGlobeRow): EarthquakeGlobePointFeature {
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
    },
  };
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
 */
export function buildEarthquakeGlobeFeatureCollection(
  rows: EarthquakeGlobeRow[],
  options: { minMagnitude?: number; now?: Date } = {},
): EarthquakeGlobeFeatureCollection {
  const minMagnitude = options.minMagnitude ?? 0;
  const now = options.now ?? new Date();

  const features = rows
    .filter((row) => isGlobeEarthquake(row, now))
    .filter((row) => {
      const mag = typeof row.magnitude === "number" ? row.magnitude : Number(row.magnitude);
      return !Number.isNaN(mag) && mag >= minMagnitude;
    })
    .map(toEarthquakeGlobeFeature);

  return { type: "FeatureCollection", features };
}
