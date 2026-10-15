import { TAIWAN_COUNTIES, type TaiwanCounty } from "@/lib/constants/taiwanDistricts";
import { LIVE_TRUCK_CITIES, LIVE_UNREACHABLE_COUNTIES, countyForLiveCity } from "@/lib/tools/garbageTrucks/live";

/**
 * Per-county coverage of the 垃圾車與清潔隊 page (issue #674 / B-16, owner
 * decision D6): the page only has garbage-truck route data for some counties,
 * and must say so county by county instead of letting readers assume it covers
 * everywhere. Every county not listed as `available` is sent to the 清潔隊
 * contact data (the page's other tab), which does cover all 22.
 *
 * This is plain data on purpose. Later tickets extend it without touching the
 * page structure. The `live` column is derived from live.ts (#679): a county is
 * "available" once its city has a live-location adapter there, and
 * "unavailable" (shown as 「暫無即時資料」) when the city publishes a feed that
 * our servers cannot reach.
 */

/** Code stored in garbage_route_stops.city (and accepted by /api/garbage-routes?city=). */
export type GarbageRouteCity = "taipei" | "new_taipei";

export type CoverageStatus = "available" | "none";

/**
 * Live-position status of a county. "unavailable" is a county whose city does
 * publish live positions but whose server our hosting cannot reach — distinct
 * from "none" (no live dataset known), and shown to visitors as 「暫無即時資料」.
 */
export type LiveCoverageStatus = CoverageStatus | "unavailable";

/** What the coverage table prints for each live status. */
export const LIVE_STATUS_LABELS: Readonly<Record<LiveCoverageStatus, string>> = {
  available: "有資料",
  unavailable: "暫無即時資料",
  none: "尚未提供",
};

export interface CountyCoverage {
  county: TaiwanCounty;
  /** 路線與收運時間 — rows in garbage_route_stops for this county. */
  routes: CoverageStatus;
  /** 即時位置 — opened-page-only live truck positions (not stored). */
  live: LiveCoverageStatus;
}

export const ROUTE_CITY_BY_COUNTY: Readonly<Record<string, GarbageRouteCity>> = {
  臺北市: "taipei",
  新北市: "new_taipei",
};

export const GARBAGE_ROUTE_CITIES: readonly GarbageRouteCity[] = ["taipei", "new_taipei"];

export function isGarbageRouteCity(value: unknown): value is GarbageRouteCity {
  return typeof value === "string" && (GARBAGE_ROUTE_CITIES as readonly string[]).includes(value);
}

/** The county name a route-city code stands for, e.g. "taipei" -> "臺北市". */
export function countyForRouteCity(city: GarbageRouteCity): TaiwanCounty {
  return city === "taipei" ? "臺北市" : "新北市";
}

export function getRouteCityForCounty(county: string | null | undefined): GarbageRouteCity | null {
  if (!county) return null;
  return ROUTE_CITY_BY_COUNTY[county] ?? null;
}

const LIVE_COUNTIES: ReadonlySet<string> = new Set(LIVE_TRUCK_CITIES.map(countyForLiveCity));

const liveStatusForCounty = (county: TaiwanCounty): LiveCoverageStatus => {
  if (LIVE_COUNTIES.has(county)) return "available";
  if (LIVE_UNREACHABLE_COUNTIES.includes(county)) return "unavailable";
  return "none";
};

export const GARBAGE_COVERAGE: readonly CountyCoverage[] = TAIWAN_COUNTIES.map((county) => ({
  county,
  routes: getRouteCityForCounty(county) ? "available" : "none",
  live: liveStatusForCounty(county),
}));

export function getCoverageForCounty(county: string | null | undefined): CountyCoverage | null {
  return GARBAGE_COVERAGE.find((row) => row.county === county) ?? null;
}

/** Shown for any county without route data — the acceptance text of issue #674. */
export const NO_ROUTE_DATA_MESSAGE = "尚無路線資料，請洽清潔隊";
