/**
 * Issue #593 (parent #583) — the "項目 → 地球資料" pure-transform module for
 * the 颱風 (typhoons) item. Same no-DB/no-DOM/no-MapLibre contract #587
 * established and #588 (earthquakes)/#589 (epidemics) already followed —
 * see lib/tools/globeWatch/earthquakeGlobeFeatures.ts's doc comment for the
 * convention this mirrors.
 *
 * The core rule (#583's decision, this ticket's main acceptance criterion)
 * is an OCEAN-BASIN SPLIT, not a per-storm identity match across sources:
 *
 * - Western Pacific: ONLY the existing CWA typhoon sync's rows (synced by
 *   lib/server/cwa/sources/typhoon.ts into cwa_alerts under dataset
 *   W-C0034-005 — "沿用既有的 CWA 颱風同步，不新增管線") are ever shown. That
 *   feed only ever covers the West Pacific/South China Sea (see that
 *   module's own doc comment), so every CWA row is implicitly basin "WP" —
 *   nothing needs to derive a basin for it.
 * - Every other basin: ONLY GDACS's TC event rows
 *   (lib/server/gdacs/queries.ts, basin derived by lib/server/gdacs/basin.ts)
 *   are shown — any GDACS TC row whose OWN basin is ALSO "WP" is dropped
 *   here, so the same storm can never surface twice just because both
 *   sources happen to be tracking something in that basin.
 *
 * Because of this, the dedup needs no per-storm name/identity matching
 * between the two sources at all — it is a pure basin-level filter, applied
 * independently of whichever rows happen to be present at call time (AC:
 * "西太平洋同時有 CWA 與 GDACS 資料時只輸出 CWA；大西洋只輸出 GDACS").
 */

/** One active CWA typhoon-track alert row — the same shape
 * lib/server/cwa/queries.ts's listActiveCwaTyphoons() returns (itself read
 * straight from cwa_alerts, dataset_id = 'W-C0034-005', no new pipeline). */
export interface CwaTyphoonRow {
  alertKey: string;
  /** Already-composed display string, e.g. "強烈颱風 山竹 (Mangkhut) 第22號"
   * or "熱帶性低氣壓 TD22" — see lib/server/cwa/sources/typhoon.ts's
   * `identity`/`classify`. Used verbatim as this storm's display name (AC:
   * 顯示中文名稱 — the Chinese name is already embedded in this string); this
   * module does not re-parse it further. */
  event: string;
  headline: string | null;
  description: string | null;
  /**
   * CWA's typhoon sync bakes the latest fix's coordinates into a fixed
   * "北緯 23.5° / 東經 121.2°" text string (see typhoon.ts's `position`
   * local) rather than storing lat/lng columns — cwa_alerts has no such
   * columns, and adding them would be a schema/pipeline change #583
   * explicitly rules out for this ticket. parseCwaTyphoonPosition() below
   * parses that known, deterministic format back into numbers so the globe
   * can still place a marker. When this is null (no coordinates in the
   * bulletin, e.g. a TD with no fix yet), the storm still appears in
   * `listItems` but contributes no point feature.
   */
  areaDesc: string | null;
  effective: string | Date | null;
  expires: string | Date | null;
  web: string | null;
}

/** One active GDACS TC event row — the same shape
 * lib/server/gdacs/queries.ts's listActiveTcEvents() returns. */
export interface GdacsTcRow {
  eventId: string;
  episodeId: string;
  alertLevel: "Green" | "Orange" | "Red";
  countryIso: string | null;
  lat: number;
  lng: number;
  startTime: string | Date | null;
  endTime: string | Date | null;
  title: string;
  reportUrl: string | null;
  /** GDACS's own basin classification for this TC (see
   * lib/server/gdacs/basin.ts's deriveTcBasin — a simplified box
   * classifier, not the official WMO/RSMC boundaries). Null when it
   * couldn't be derived; treated as "not WP" (not dropped) by this module,
   * since CWA's authority is specifically and only the West Pacific — an
   * ambiguous/undetermined basin is never a reason to suppress GDACS data
   * that has no CWA counterpart anyway. */
  basin: string | null;
  /** A trimmed GeoJSON FeatureCollection of the storm's track (LineString
   * segments + a current-position point), already fetched by the GDACS
   * sync (lib/server/gdacs/types.ts) — null if unavailable. */
  trackGeoJson: Record<string, unknown> | null;
}

const CWA_LAT_PATTERN = /北緯\s*([\d.]+)\s*°/;
const CWA_LNG_PATTERN = /東經\s*([\d.]+)\s*°/;

/**
 * Parses CWA's own "北緯 23.5° / 東經 121.2°" text format (produced by the
 * same sync module, see CwaTyphoonRow's doc comment) back into numeric
 * lat/lng. Returns null when either half is missing or unparseable — a
 * storm with no usable position still appears in the list, just without a
 * globe marker (same "don't drop the row" principle
 * epidemicsTransform.ts's ISO-less fallback uses, applied to a missing
 * coordinate instead of a missing country).
 */
export function parseCwaTyphoonPosition(areaDesc: string | null): { lat: number; lng: number } | null {
  if (!areaDesc) return null;
  const latMatch = areaDesc.match(CWA_LAT_PATTERN);
  const lngMatch = areaDesc.match(CWA_LNG_PATTERN);
  if (!latMatch || !lngMatch) return null;
  const lat = Number(latMatch[1]);
  const lng = Number(lngMatch[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export type TyphoonSource = "cwa" | "gdacs";

/** GDACS's own three-tier alert color convention (see
 * lib/server/gdacs/types.ts's GdacsAlertLevel) — reused verbatim as this
 * item's marker color for non-WP storms, so a later "全球災害" item sharing
 * the same GDACS data never disagrees with this one about what each color
 * means. */
export const GDACS_ALERT_COLORS: Record<"Green" | "Orange" | "Red", string> = {
  Green: "#22c55e",
  Orange: "#f97316",
  Red: "#dc2626",
};

/** Marker color for West-Pacific/CWA-sourced storms — CWA has no "alert
 * level" concept comparable to GDACS's, so this item uses one fixed color
 * to distinguish "this is the CWA-authoritative West Pacific feed" at a
 * glance, consistent regardless of the storm's own intensity classification
 * (CWA's own 熱帶性低氣壓/輕度/中度/強烈颱風 ladder is carried in `name` text
 * instead, not re-encoded as a second color scale here). */
export const CWA_TYPHOON_MARKER_COLOR = "#4f46e5";

export interface TyphoonLegendEntry {
  key: string;
  color: string;
  labelDefault: string;
}

/** This item's own legend (AC/spec: 每個項目都有專屬圖例) — one entry for the
 * CWA/West-Pacific feed, three for GDACS's alert-level ladder. */
export const TYPHOON_LEGEND: TyphoonLegendEntry[] = [
  { key: "cwa", color: CWA_TYPHOON_MARKER_COLOR, labelDefault: "西太平洋（中央氣象署）" },
  { key: "gdacs-green", color: GDACS_ALERT_COLORS.Green, labelDefault: "GDACS 綠色警戒" },
  { key: "gdacs-orange", color: GDACS_ALERT_COLORS.Orange, labelDefault: "GDACS 橙色警戒" },
  { key: "gdacs-red", color: GDACS_ALERT_COLORS.Red, labelDefault: "GDACS 紅色警戒" },
];

export interface TyphoonPointProperties {
  id: string;
  source: TyphoonSource;
  name: string;
  /** "WP" for every CWA-sourced row; GDACS's own basin (possibly null) for
   * everything else. */
  basin: string | null;
  alertLevel: "Green" | "Orange" | "Red" | null;
  web: string | null;
  startTime: string | null;
  endTime: string | null;
  markerColor: string;
}

export type TyphoonPointFeature = GeoJSON.Feature<GeoJSON.Point, TyphoonPointProperties>;
export type TyphoonPointFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, TyphoonPointProperties>;

export interface TyphoonListItem {
  id: string;
  source: TyphoonSource;
  name: string;
  basin: string | null;
  alertLevel: "Green" | "Orange" | "Red" | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  /** Free-text summary — CWA's headline/description (wind speed, motion,
   * etc.); null for GDACS rows, whose structured fields (alertLevel,
   * countryIso via `basin`) already carry the summary. */
  detail: string | null;
  web: string | null;
  /** True when a track/potential-path GeoJSON is available for this storm
   * (always false for CWA rows — see `tracks`' own doc comment below for
   * why). */
  hasTrack: boolean;
}

export interface TyphoonsGlobeData {
  points: TyphoonPointFeatureCollection;
  /**
   * Merged GDACS track GeoJSON (LineString segments + current-position
   * points) for every non-WP storm that has one — each feature tagged with
   * a `stormEventId` property so the globe can style/filter per storm if a
   * later ticket needs to. CWA/West-Pacific rows never contribute a track
   * here: the existing CWA typhoon sync fetches the forecast fix array from
   * CWA's API (RawFix[] in lib/server/cwa/sources/typhoon.ts) but only uses
   * it to compute a scalar `expires` timestamp — the actual forecast-track
   * coordinates are discarded before the row ever reaches cwa_alerts, and
   * there is nothing in the database to draw a line from without a new
   * ingestion pipeline, which #583 explicitly rules out for this ticket
   * ("不新增管線"). Every CWA list item/marker instead links out to CWA's own
   * official track chart (AC: 一鍵連到「氣象警報」工具頁 — see each row's `web`).
   */
  tracks: GeoJSON.FeatureCollection;
  listItems: TyphoonListItem[];
  legend: TyphoonLegendEntry[];
  /** True when there is no active cyclone from either source at all (AC:
   * 沒有任何活動颱風時顯示空狀態說明). */
  emptyState: boolean;
}

const toIsoOrNull = (value: string | Date | null): string | null => {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

/**
 * Builds the typhoons item's globe/list data from the two independent,
 * already-"active"-filtered row sets (see this module's own doc comment for
 * the basin-split rule). Never throws on missing coordinates/tracks — a row
 * that can't be plotted still contributes a list item.
 */
export function buildTyphoonsGlobeData(cwaRows: CwaTyphoonRow[], gdacsRows: GdacsTcRow[]): TyphoonsGlobeData {
  const pointFeatures: TyphoonPointFeature[] = [];
  const listItems: TyphoonListItem[] = [];

  for (const row of cwaRows) {
    const position = parseCwaTyphoonPosition(row.areaDesc);
    const detail = [row.headline, row.description].filter(Boolean).join(" ") || null;
    const startTime = toIsoOrNull(row.effective);
    const endTime = toIsoOrNull(row.expires);

    listItems.push({
      id: row.alertKey,
      source: "cwa",
      name: row.event,
      basin: "WP",
      alertLevel: null,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      startTime,
      endTime,
      detail,
      web: row.web,
      hasTrack: false,
    });

    if (position) {
      pointFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [position.lng, position.lat] },
        properties: {
          id: row.alertKey,
          source: "cwa",
          name: row.event,
          basin: "WP",
          alertLevel: null,
          web: row.web,
          startTime,
          endTime,
          markerColor: CWA_TYPHOON_MARKER_COLOR,
        },
      });
    }
  }

  // AC: 西太平洋只取 CWA — any GDACS TC row whose own basin is "WP" is
  // dropped here, so the same storm never surfaces from both sources at once.
  const nonWpGdacsRows = gdacsRows.filter((row) => row.basin !== "WP");

  const trackFeatures: GeoJSON.Feature[] = [];
  for (const row of nonWpGdacsRows) {
    const startTime = toIsoOrNull(row.startTime);
    const endTime = toIsoOrNull(row.endTime);
    const markerColor = GDACS_ALERT_COLORS[row.alertLevel] ?? GDACS_ALERT_COLORS.Green;

    listItems.push({
      id: row.eventId,
      source: "gdacs",
      name: row.title,
      basin: row.basin,
      alertLevel: row.alertLevel,
      lat: row.lat,
      lng: row.lng,
      startTime,
      endTime,
      detail: null,
      web: row.reportUrl,
      hasTrack: Boolean(row.trackGeoJson),
    });

    pointFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [row.lng, row.lat] },
      properties: {
        id: row.eventId,
        source: "gdacs",
        name: row.title,
        basin: row.basin,
        alertLevel: row.alertLevel,
        web: row.reportUrl,
        startTime,
        endTime,
        markerColor,
      },
    });

    const track = row.trackGeoJson as { features?: GeoJSON.Feature[] } | null;
    if (track?.features?.length) {
      for (const feature of track.features) {
        trackFeatures.push({
          ...feature,
          properties: { ...(feature.properties ?? {}), stormEventId: row.eventId },
        });
      }
    }
  }

  return {
    points: { type: "FeatureCollection", features: pointFeatures },
    tracks: { type: "FeatureCollection", features: trackFeatures },
    listItems,
    legend: TYPHOON_LEGEND,
    emptyState: listItems.length === 0,
  };
}
