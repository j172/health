import type { TaiwanCounty } from "@/lib/constants/taiwanDistricts";
import type { LiveTruckCity, TruckFreshnessWindow, TruckPosition } from "@/lib/tools/garbageTrucks/live";

/**
 * The county-pluggable skeleton of the live garbage-truck layer (issue #679).
 *
 * One adapter per city: it names the upstream endpoint and turns that
 * endpoint's raw text into `TruckPosition[]`. Everything else — the request,
 * in-flight de-duplication, the 60-120 s cache, freshness judgement, per-county
 * degradation, the route and the map — is generic and lives in getLiveTrucks.ts
 * and the page. Ticket #680 added 臺中市 by writing one more adapter file and
 * registering it in registry.ts; no other server code changed.
 *
 * Contract for `parse`:
 *  - input is the response body as text (CSV, or JSON text — the adapter decides);
 *  - return only usable positions: a real vehicle plate, coordinates inside the
 *    city's own area, a parseable report time (as a UTC ISO instant), one entry
 *    per vehicle (newest report wins);
 *  - do NOT judge freshness — the same snapshot is served for up to ~90 s and
 *    must be re-judged against the clock on every request;
 *  - throw when the text is not the expected format (an HTML error page, a
 *    renamed header, an empty body) so the county degrades instead of showing
 *    a misleading 「目前沒有垃圾車」; a well-formed feed with zero trucks is
 *    NOT an error and returns [].
 */
export interface LiveTruckAdapter {
  city: LiveTruckCity;
  county: TaiwanCounty;
  /** Publisher and dataset name for the page's attribution line. */
  sourceLabel: string;
  /** The data.gov.tw dataset page (human-readable; shown to visitors). */
  datasetUrl: string;
  /** The upstream URL fetched when a visitor opens the page. Never sent to the browser. */
  endpoint: string;
  /**
   * How old a position may be before it is flagged 「資料較舊」 and before it is
   * hidden. Optional: omit it and the shared default (10 / 30 minutes, sized for
   * a feed that refreshes every ~2 minutes) applies. Declare it when the feed
   * refreshes more slowly, with the dataset's update interval as the basis.
   */
  freshness?: TruckFreshnessWindow;
  parse(rawText: string): TruckPosition[];
}

/** Reads one URL; the real implementation goes through lib/server/net/httpClient.ts (never global fetch()). */
export type LiveFetcher = (url: string) => Promise<{ status: number; text: string }>;

export type LiveAdapterRegistry = Readonly<Partial<Record<LiveTruckCity, LiveTruckAdapter>>>;

/** Dependencies of getLiveTrucks; every field is optional so production callers pass nothing. */
export interface LiveDeps {
  fetcher?: LiveFetcher;
  /** Clock in epoch milliseconds. */
  now?: () => number;
  adapters?: LiveAdapterRegistry;
  /** Where the "upstream fetch" log lines go; defaults to console.info. */
  log?: (line: string) => void;
  /** Hard ceiling on one upstream request, regardless of what the HTTP client does. */
  deadlineMs?: number;
}
