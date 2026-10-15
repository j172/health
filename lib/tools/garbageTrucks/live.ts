import type { TaiwanCounty } from "@/lib/constants/taiwanDistricts";

/**
 * Client-safe vocabulary of the live garbage-truck layer (issue #679 / B-17,
 * upstream decision #13: positions are fetched only when a visitor opens the
 * page and are never stored). Shared by the server (`getLiveTrucks`, the
 * route) and the page, so "which cities have live data" and "how old a position
 * may be" are each defined in exactly one place. No server-only imports here.
 *
 * Adding a city (the way #680 added 臺中市): add its code to LIVE_TRUCK_CITIES and
 * LIVE_CITY_COUNTY below, write an adapter under
 * lib/server/garbageLive/adapters/ and register it in lib/server/garbageLive/registry.ts.
 * The coverage table (coverage.ts) and the page pick the new city up from here.
 */

/** City codes with a live-position adapter. */
export const LIVE_TRUCK_CITIES = ["new_taipei", "taichung"] as const;

export type LiveTruckCity = (typeof LIVE_TRUCK_CITIES)[number];

const LIVE_CITY_COUNTY: Readonly<Record<LiveTruckCity, TaiwanCounty>> = {
  new_taipei: "新北市",
  taichung: "臺中市",
};

export function isLiveTruckCity(value: unknown): value is LiveTruckCity {
  return typeof value === "string" && (LIVE_TRUCK_CITIES as readonly string[]).includes(value);
}

/** The county a live city code stands for, e.g. "new_taipei" -> "新北市". */
export function countyForLiveCity(city: LiveTruckCity): TaiwanCounty {
  return LIVE_CITY_COUNTY[city];
}

/**
 * Counties whose city publishes a live-position dataset that our servers cannot
 * reach (2026-10-15 probe: unreachable from every network we can run from).
 * The coverage table shows 「暫無即時資料」 for these instead of a blank, and
 * the page makes no attempt to fetch them.
 */
export const LIVE_UNREACHABLE_COUNTIES: readonly TaiwanCounty[] = ["臺南市", "高雄市"];

// --- freshness -------------------------------------------------------------

// The shared default window below is sized for a feed that refreshes about every
// 2 minutes (新北市). A city whose feed refreshes more slowly declares its own
// window on its adapter (see TruckFreshnessWindow); 臺中市 does (#680).

/** Position reports up to this old are shown as current. */
export const LIVE_FRESH_MAX_AGE_SECONDS = 10 * 60;
/** Older than FRESH but not older than this: still drawn, flagged 「資料較舊」. Beyond it: never drawn. */
export const LIVE_EXPIRED_AGE_SECONDS = 30 * 60;
/** A report this far ahead of our clock is treated as clock skew; further ahead is a bad record. Shared by every city. */
export const LIVE_FUTURE_SKEW_SECONDS = 5 * 60;

/**
 * How old a report may be before it is flagged and before it is hidden, in
 * seconds. A city's adapter may declare its own (a feed that refreshes every N
 * minutes needs a fresh window of at least 2N, or most of its trucks read as
 * 「資料較舊」 for no reason); an adapter that declares none gets DEFAULT_FRESHNESS.
 */
export interface TruckFreshnessWindow {
  /** Reports up to this old are fresh (shown normally). */
  freshMaxAgeSeconds: number;
  /** Reports older than freshMaxAgeSeconds but not older than this are stale (drawn, flagged); older ones are hidden. Must stay bounded. */
  expiredAfterSeconds: number;
}

export const DEFAULT_FRESHNESS: TruckFreshnessWindow = {
  freshMaxAgeSeconds: LIVE_FRESH_MAX_AGE_SECONDS,
  expiredAfterSeconds: LIVE_EXPIRED_AGE_SECONDS,
};

export type TruckFreshness = "fresh" | "stale" | "expired" | "invalid";

/**
 * Classifies a position by its age in seconds (now minus the report time)
 * against `window` (the shared default unless the city declares its own).
 * fresh: shown normally; stale: shown but flagged; expired: hidden (and
 * counted); invalid: not a number or implausibly in the future — hidden.
 */
export function classifyTruckAge(ageSeconds: number, window: TruckFreshnessWindow = DEFAULT_FRESHNESS): TruckFreshness {
  if (!Number.isFinite(ageSeconds)) return "invalid";
  if (ageSeconds < -LIVE_FUTURE_SKEW_SECONDS) return "invalid";
  if (ageSeconds <= window.freshMaxAgeSeconds) return "fresh";
  if (ageSeconds <= window.expiredAfterSeconds) return "stale";
  return "expired";
}

/** "7 分鐘前"-style age for a position, never negative. */
export function formatTruckAge(ageSeconds: number): string {
  const seconds = Math.max(0, ageSeconds);
  if (seconds < 60) return "不到 1 分鐘前";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`;
  return `${Math.floor(seconds / 3600)} 小時前`;
}

/**
 * "2026/10/15 22:48:51" — an ISO instant shown as Asia/Taipei wall-clock time
 * (the way the city's own feed prints it). Done by hand rather than with Intl so
 * the server render and the browser can never disagree. Returns "" for a value
 * that is not a date.
 */
export function formatTaipeiDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const local = new Date(ms + 8 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${local.getUTCFullYear()}/${pad(local.getUTCMonth() + 1)}/${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
  );
}

// --- shapes shared by the route and the page ---------------------------------

/** One vehicle position as an adapter reports it (no judgement about freshness yet). */
export interface TruckPosition {
  /** The city's route/line code, e.g. "251010". */
  lineId: string;
  /** Vehicle plate as published, e.g. "KEV-0028". Unique per vehicle within one city. */
  car: string;
  lat: number;
  lng: number;
  /** Where the truck was last reported (street address text); null when the feed leaves it blank. */
  location: string | null;
  /** District name, e.g. "淡水區"; null when the feed has none. */
  district: string | null;
  /** UTC instant of the position report, ISO 8601. */
  recordedAt: string;
}

/** A position as served to the page: judged against the clock at request time. */
export interface LiveTruck extends TruckPosition {
  /** Seconds between the report and this response; never negative. */
  ageSeconds: number;
  /** True for reports older than the city's freshMaxAgeSeconds (still drawn, flagged). */
  stale: boolean;
}

export type LiveUnavailableReason = "timeout" | "network" | "http_error" | "bad_payload";

export interface LiveTrucksCityResult {
  city: LiveTruckCity;
  county: TaiwanCounty;
  /** "unavailable" means this county's feed could not be read right now — the other counties are unaffected. */
  status: "ok" | "unavailable";
  reason: LiveUnavailableReason | null;
  /** Fresh and stale-flagged positions, freshest first. Empty when unavailable. */
  trucks: LiveTruck[];
  /** Positions left out: older than the city's expiredAfterSeconds, or with an impossible report time. */
  hiddenCount: number;
  /** The window this city's positions were judged by, so the page words its thresholds from the same numbers. */
  freshness: TruckFreshnessWindow;
  /** Newest report time among the positions the feed returned (never later than the response time); null when none or unavailable. */
  dataAsOf: string | null;
  /** When our server last asked the upstream for this data; null when unavailable. */
  fetchedAt: string | null;
  source: { label: string; datasetUrl: string };
}

export interface LiveTrucksResponse {
  generatedAt: string;
  cities: LiveTrucksCityResult[];
}
