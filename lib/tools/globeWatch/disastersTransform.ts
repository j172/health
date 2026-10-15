/**
 * Issue #594 (parent #583) — the "項目 → 地球資料" pure-transform module for
 * the "全球災害" (disasters) item, following the same no-DB/no-DOM/no-MapLibre
 * contract as lib/tools/globeWatch/{earthquakeGlobeFeatures,
 * epidemicsTransform}.ts. Input is already-queried `gdacs_events` rows (see
 * lib/server/gdacs/queries.ts's getCurrentGdacsDisasterEvents); output is a
 * locale-agnostic structure the client component renders and filters.
 *
 * Scope, straight from #583's spec: "全球災害：只收 GDACS 的 FL、VO、DR、WF；
 * EQ 不重複顯示（只用來替地震附加警戒色），TC 歸到颱風項目" — this module
 * defensively drops anything that isn't FL/VO/DR/WF even if a caller's query
 * ever widens (AC: "EQ、TC 不出現在這個項目的輸出").
 */
import { GDACS_DISASTER_TYPES, isGdacsDisasterType, type GdacsDisasterType } from "./disasterTypeNames";
import { GDACS_ALERT_LEVEL_ORDER, resolveAlertLevelColor, isGdacsAlertLevelName } from "./disasterAlertLevelNames";

export { GDACS_DISASTER_TYPES, isGdacsDisasterType };
export type { GdacsDisasterType };

/** Input row shape this module consumes — mirrors `gdacs_events` columns
 * (see lib/server/gdacs/queries.ts's GdacsDisasterEventRow), not GDACS's own
 * raw property names. */
export interface DisasterEventRow {
  eventType: string;
  eventId: string;
  alertLevel: string;
  /** ISO 3166-1 alpha-3, or null — GDACS occasionally omits it (e.g. an
   * event over open ocean/international waters). */
  countryIso: string | null;
  lat: number;
  lng: number;
  /** ISO 8601 string, or null. */
  startTime: string | null;
  /** ISO 8601 string, or null — null means still ongoing per GDACS. */
  endTime: string | null;
  /** Original-language (always English for GDACS) event title. */
  title: string;
  reportUrl: string | null;
}

export interface DisasterFeatureProperties {
  id: string;
  eventType: GdacsDisasterType;
  alertLevel: string;
  countryIso: string | null;
  startTime: string | null;
  endTime: string | null;
  title: string;
  reportUrl: string | null;
  /** AC: 依 GDACS 紅/橙/綠警戒等級上色 — resolved once here so the globe layer
   * and the list never need their own copy of the color rule. */
  markerColor: string;
}

export type DisasterPointFeature = GeoJSON.Feature<GeoJSON.Point, DisasterFeatureProperties>;
export type DisasterFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, DisasterFeatureProperties>;

/** A list row — same fields as a feature's properties plus the coordinates
 * (so the list can drive a "fly to" on click, same pattern as the
 * earthquake item's list→globe interaction). */
export interface DisasterListItem extends DisasterFeatureProperties {
  lat: number;
  lng: number;
}

export interface DisastersGlobeData {
  featureCollection: DisasterFeatureCollection;
  /** Filtered by the caller's `enabledTypes`, sorted most-severe-alert-level
   * first, then most-recent `startTime` first. */
  listItems: DisasterListItem[];
  /**
   * AC: "某災種目前沒有事件時顯示明確空狀態說明" — true for a disaster type
   * with zero CURRENT events, computed from the full current dataset
   * (*before* the `enabledTypes` checkbox filter) so unchecking a type on
   * the UI is never confused with "no events exist" for it.
   */
  emptyByType: Record<GdacsDisasterType, boolean>;
}

const buildEmptyId = (eventType: string, eventId: string): string => `${eventType}-${eventId}`;

function toDisasterFeature(row: DisasterEventRow & { eventType: GdacsDisasterType }): DisasterPointFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [row.lng, row.lat] },
    properties: {
      id: buildEmptyId(row.eventType, row.eventId),
      eventType: row.eventType,
      alertLevel: row.alertLevel,
      countryIso: row.countryIso,
      startTime: row.startTime,
      endTime: row.endTime,
      title: row.title,
      reportUrl: row.reportUrl,
      markerColor: resolveAlertLevelColor(row.alertLevel),
    },
  };
}

const alertLevelSortWeight = (level: string): number =>
  isGdacsAlertLevelName(level) ? GDACS_ALERT_LEVEL_ORDER[level] : 0;

const toSortableTime = (value: string | null): number => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Builds the disasters item's globe + list data from `rows` (already fetched
 * for FL/VO/DR/WF only — see getCurrentGdacsDisasterEvents — but filtered
 * again here defensively) and `enabledTypes` (the checkbox selection; AC:
 * "勾選/取消勾選正確過濾 features 與 listItems").
 */
export function buildDisastersGlobeData(
  rows: DisasterEventRow[],
  enabledTypes: Iterable<GdacsDisasterType> = GDACS_DISASTER_TYPES,
): DisastersGlobeData {
  const enabled = new Set(enabledTypes);

  // Defensive filter: only FL/VO/DR/WF ever makes it past this point,
  // regardless of what the caller's query returned (AC: EQ、TC 不出現在這個
  // 項目的輸出).
  const currentRows = rows.filter(
    (row): row is DisasterEventRow & { eventType: GdacsDisasterType } => isGdacsDisasterType(row.eventType),
  );

  const emptyByType = Object.fromEntries(
    GDACS_DISASTER_TYPES.map((type) => [type, currentRows.every((row) => row.eventType !== type)]),
  ) as Record<GdacsDisasterType, boolean>;

  const selectedRows = currentRows.filter((row) => enabled.has(row.eventType));

  const features = selectedRows.map(toDisasterFeature);

  const listItems: DisasterListItem[] = selectedRows
    .map((row, index) => ({ ...features[index].properties, lat: row.lat, lng: row.lng }))
    .sort((a, b) => {
      const severityDiff = alertLevelSortWeight(b.alertLevel) - alertLevelSortWeight(a.alertLevel);
      if (severityDiff !== 0) return severityDiff;
      return toSortableTime(b.startTime) - toSortableTime(a.startTime);
    });

  return {
    featureCollection: { type: "FeatureCollection", features },
    listItems,
    emptyByType,
  };
}
