/**
 * Issue #774 (parent #773) — the "項目 → 地球資料" pure-transform module for
 * the "武裝衝突" (conflicts) item. Same no-DB/no-DOM/no-MapLibre contract
 * lib/tools/globeWatch/disastersTransform.ts and
 * lib/tools/globeWatch/typhoonsTransform.ts already follow. Input is
 * already-queried `conflict_events` rows (see
 * lib/server/conflicts/queries.ts's getCurrentGdeltConflictEvents); output
 * is a locale-agnostic structure the client component renders.
 *
 * This ticket is GDELT-only — #773's spec reserves a `sources:
 * ("ucdp"|"gdelt")[]` field on the merged marker for the still-blocked UCDP
 * half (#775), including a "雙來源確認" badge when both sources report the
 * same event. There is no second source to merge against yet, so this
 * module's `sources` array is always `["gdelt"]` for every row today — kept
 * as an array (not a single enum) specifically so #775 can add UCDP rows
 * and the actual merge/dedup logic later without a shape change here or in
 * any component that already reads `properties.sources`.
 */
import {
  CONFLICT_ROOT_NAMES,
  UNKNOWN_CONFLICT_ROOT_COLOR,
  isConflictCameoRootCode,
  resolveConflictRootColor,
} from "./conflictCameoRootNames";

export { CONFLICT_ROOT_NAMES, isConflictCameoRootCode };

export type ConflictSource = "gdelt" | "ucdp";

/** Input row shape this module consumes — mirrors `conflict_events` columns
 * (see lib/server/conflicts/queries.ts's GdeltConflictEventRow), not
 * GDELT's own raw column names. */
export interface ConflictEventRow {
  sourceEventId: string;
  /** "YYYY-MM-DD". */
  eventDate: string;
  countryIso: string | null;
  countryName: string | null;
  lat: number;
  lng: number;
  fatalitiesEstimate: number | null;
  /** The raw CAMEO root code ("19"/"20"). */
  rootCode: string;
  description: string;
  sourceUrl: string | null;
}

export interface ConflictFeatureProperties {
  id: string;
  sourceEventId: string;
  eventDate: string;
  countryName: string | null;
  fatalitiesEstimate: number | null;
  rootCode: string;
  description: string;
  sourceUrl: string | null;
  markerColor: string;
  /** Always `["gdelt"]` today — see this module's own doc comment. */
  sources: ConflictSource[];
}

export type ConflictPointFeature = GeoJSON.Feature<GeoJSON.Point, ConflictFeatureProperties>;
export type ConflictFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ConflictFeatureProperties>;

/** A list row — same fields as a feature's properties plus the coordinates
 * (so a future ticket's list→globe "fly to" interaction has everything it
 * needs without a second lookup, same shape precedent as
 * disastersTransform.ts's DisasterListItem). */
export interface ConflictListItem extends ConflictFeatureProperties {
  lat: number;
  lng: number;
}

export interface ConflictsGlobeData {
  featureCollection: ConflictFeatureCollection;
  /** Sorted most-recent-event-date first. */
  listItems: ConflictListItem[];
  /** True when there are no current GDELT conflict events at all (same
   * "沒有事件時顯示明確空狀態說明" convention as the typhoons/disasters items). */
  emptyState: boolean;
}

const buildId = (row: ConflictEventRow): string => `gdelt-${row.sourceEventId}`;

function toConflictFeature(row: ConflictEventRow): ConflictPointFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties: {
      id: buildId(row),
      sourceEventId: row.sourceEventId,
      eventDate: row.eventDate,
      countryName: row.countryName,
      fatalitiesEstimate: row.fatalitiesEstimate,
      rootCode: row.rootCode,
      description: row.description,
      sourceUrl: row.sourceUrl,
      markerColor: resolveConflictRootColor(row.rootCode),
      sources: ["gdelt"],
    },
  };
}

/**
 * Builds the conflicts item's globe + list data from `rows` (already
 * fetched for `source = 'gdelt'` only — see getCurrentGdeltConflictEvents —
 * but filtered again here defensively against a non-finite lat/lng, the
 * same "never let one bad row crash the whole render" convention
 * disastersTransform.ts/typhoonsTransform.ts both already follow).
 */
export function buildConflictsGlobeData(rows: ConflictEventRow[]): ConflictsGlobeData {
  const usableRows = rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));

  const features = usableRows.map(toConflictFeature);

  const listItems: ConflictListItem[] = usableRows
    .map((row, index) => ({ ...features[index].properties, lat: row.lat, lng: row.lng }))
    .sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : 0));

  return {
    featureCollection: { type: "FeatureCollection", features },
    listItems,
    emptyState: listItems.length === 0,
  };
}

/** This item's own legend (AC/spec: 每個項目都有專屬圖例) — one entry per
 * CAMEO root code, reusing GDACS's Orange/Red severity colors (see
 * conflictCameoRootNames.ts's own doc comment for why). */
export interface ConflictLegendEntry {
  key: string;
  color: string;
  labelDefault: string;
}

export const CONFLICT_LEGEND: ConflictLegendEntry[] = [
  { key: "root-19", color: CONFLICT_ROOT_NAMES["19"].color, labelDefault: CONFLICT_ROOT_NAMES["19"].zh },
  { key: "root-20", color: CONFLICT_ROOT_NAMES["20"].color, labelDefault: CONFLICT_ROOT_NAMES["20"].zh },
];

export { UNKNOWN_CONFLICT_ROOT_COLOR };
