import {
  DEFAULT_FRESHNESS,
  LIVE_TRUCK_CITIES,
  classifyTruckAge,
  type LiveTruck,
  type LiveTruckCity,
  type LiveTrucksCityResult,
  type LiveTrucksResponse,
  type LiveUnavailableReason,
  type TruckFreshnessWindow,
  type TruckPosition,
} from "@/lib/tools/garbageTrucks/live";
import type { LiveDeps, LiveTruckAdapter } from "@/lib/server/garbageLive/types";
import { LIVE_TRUCK_ADAPTERS } from "@/lib/server/garbageLive/registry";
import { defaultLiveFetcher } from "@/lib/server/garbageLive/fetcher";

/**
 * Live garbage-truck positions (issue #679 / B-17, upstream decision #13):
 * fetched only when a visitor opens the page, never written to the database.
 *
 * What stands between a page view and the city's server:
 *  1. an in-process cache of the parsed snapshot per city, LIVE_CACHE_TTL_MS
 *     (the upstream refreshes about every 2 minutes, so ~90 s costs nothing in
 *     accuracy and bounds us to ~1 upstream request per 90 s per city);
 *  2. in-flight de-duplication — while one request for a city is running, every
 *     other caller waits for that same request instead of starting its own
 *     (the shared memoizeQuery helper deliberately has none; a burst of visitors
 *     arriving as the cache expires would otherwise all hit the upstream);
 *  3. per-county graceful degradation — a failing county becomes an
 *     `unavailable` result with a reason code, never an exception, never cached,
 *     and never affects another county.
 *
 * The cached snapshot holds positions only. Freshness (fresh / stale-flagged /
 * hidden) is judged against the clock on every call, so a position that turns
 * stale inside the cache window is flagged correctly.
 */

/** Cache window: inside the 60-120 s the issue specifies. */
export const LIVE_CACHE_TTL_MS = 90_000;
/** Hard ceiling on one upstream request, independent of the HTTP client's idle timeout. */
const DEFAULT_DEADLINE_MS = 10_000;

interface Snapshot {
  positions: TruckPosition[];
  fetchedAtMs: number;
  expiresAtMs: number;
}

/** An upstream problem with a reason code that is safe to show visitors. */
class LiveUpstreamError extends Error {
  readonly reason: LiveUnavailableReason;
  constructor(reason: LiveUnavailableReason, detail: string) {
    super(detail);
    this.name = "LiveUpstreamError";
    this.reason = reason;
  }
}

const snapshots = new Map<string, Snapshot>();
const inFlight = new Map<string, Promise<Snapshot>>();

/** Test hook: forget every cached snapshot and in-flight request. */
export function resetLiveTruckCacheForTests(): void {
  snapshots.clear();
  inFlight.clear();
}

const withDeadline = <T>(work: Promise<T>, deadlineMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new LiveUpstreamError("timeout", `no answer within ${deadlineMs} ms`)), deadlineMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

async function fetchSnapshot(
  city: LiveTruckCity,
  adapter: LiveTruckAdapter,
  deps: Required<Pick<LiveDeps, "fetcher" | "now" | "log" | "deadlineMs">>,
): Promise<Snapshot> {
  const startedAt = deps.now();
  // This line is what "hit the route 5 times and the logs show 1 upstream request" counts.
  deps.log(`[garbage-live] upstream fetch city=${city}`);

  try {
    let response: { status: number; text: string };
    try {
      response = await withDeadline(deps.fetcher(adapter.endpoint), deps.deadlineMs);
    } catch (error) {
      if (error instanceof LiveUpstreamError) throw error;
      throw new LiveUpstreamError("network", error instanceof Error ? error.message : "request failed");
    }
    if (response.status !== 200) {
      throw new LiveUpstreamError("http_error", `HTTP ${response.status}`);
    }

    let positions: TruckPosition[];
    try {
      positions = adapter.parse(response.text);
    } catch (error) {
      throw new LiveUpstreamError("bad_payload", error instanceof Error ? error.message : "unparseable response");
    }

    deps.log(`[garbage-live] upstream ok city=${city} trucks=${positions.length} ms=${deps.now() - startedAt}`);
    return { positions, fetchedAtMs: startedAt, expiresAtMs: startedAt + LIVE_CACHE_TTL_MS };
  } catch (error) {
    // The detail stays in the server log; visitors only ever see the reason code.
    const reason = error instanceof LiveUpstreamError ? error.reason : "network";
    const detail = error instanceof Error ? error.message : "unknown error";
    deps.log(`[garbage-live] upstream failed city=${city} reason=${reason} detail=${detail}`);
    throw error;
  }
}

function loadSnapshot(
  city: LiveTruckCity,
  adapter: LiveTruckAdapter,
  deps: Required<Pick<LiveDeps, "fetcher" | "now" | "log" | "deadlineMs">>,
): Promise<Snapshot> {
  const cached = snapshots.get(city);
  if (cached && deps.now() < cached.expiresAtMs) return Promise.resolve(cached);

  const running = inFlight.get(city);
  if (running) return running;

  const request = (async () => {
    try {
      const snapshot = await fetchSnapshot(city, adapter, deps);
      snapshots.set(city, snapshot);
      return snapshot;
    } finally {
      inFlight.delete(city);
    }
  })();
  inFlight.set(city, request);
  return request;
}

const sourceOf = (adapter: LiveTruckAdapter) => ({ label: adapter.sourceLabel, datasetUrl: adapter.datasetUrl });

/** The window an adapter's positions are judged by: its own declaration, else the shared default. */
const freshnessOf = (adapter: LiveTruckAdapter): TruckFreshnessWindow => adapter.freshness ?? DEFAULT_FRESHNESS;

/**
 * Judges a snapshot's positions against `nowMs` and the city's freshness
 * window: fresh and stale ones are returned (stale flagged, freshest first);
 * expired and impossible ones are only counted.
 */
function judgePositions(positions: TruckPosition[], nowMs: number, window: TruckFreshnessWindow) {
  const trucks: LiveTruck[] = [];
  let hiddenCount = 0;
  let newestBelievableMs: number | null = null;

  for (const position of positions) {
    const recordedMs = Date.parse(position.recordedAt);
    const ageSeconds = Math.round((nowMs - recordedMs) / 1000);
    const freshness = classifyTruckAge(ageSeconds, window);
    if (freshness === "invalid") {
      hiddenCount += 1;
      continue;
    }
    if (newestBelievableMs === null || recordedMs > newestBelievableMs) newestBelievableMs = recordedMs;
    if (freshness === "expired") {
      hiddenCount += 1;
      continue;
    }
    trucks.push({ ...position, ageSeconds: Math.max(0, ageSeconds), stale: freshness === "stale" });
  }

  trucks.sort((a, b) => a.ageSeconds - b.ageSeconds);
  // A report a little ahead of our clock is skew; never present a data time in the future.
  const dataAsOfMs = newestBelievableMs === null ? null : Math.min(newestBelievableMs, nowMs);
  return { trucks, hiddenCount, dataAsOf: dataAsOfMs === null ? null : new Date(dataAsOfMs).toISOString() };
}

/**
 * One city's live positions. Never throws: an upstream or parser problem comes
 * back as `status: "unavailable"` with a reason code.
 */
export async function getLiveTrucks(city: LiveTruckCity, deps: LiveDeps = {}): Promise<LiveTrucksCityResult> {
  const resolved = {
    fetcher: deps.fetcher ?? defaultLiveFetcher,
    now: deps.now ?? Date.now,
    log: deps.log ?? ((line: string) => console.info(line)),
    deadlineMs: deps.deadlineMs ?? DEFAULT_DEADLINE_MS,
  };
  const adapter = (deps.adapters ?? LIVE_TRUCK_ADAPTERS)[city];

  if (!adapter) {
    // A programming error, not an upstream problem: the route validates the city and a test
    // pins LIVE_TRUCK_CITIES and the adapter registry to each other.
    throw new RangeError(`no live-truck adapter registered for city "${String(city)}"`);
  }

  const unavailable = (reason: LiveUnavailableReason): LiveTrucksCityResult => ({
    city,
    county: adapter.county,
    status: "unavailable",
    reason,
    trucks: [],
    hiddenCount: 0,
    freshness: freshnessOf(adapter),
    dataAsOf: null,
    fetchedAt: null,
    source: sourceOf(adapter),
  });

  try {
    const snapshot = await loadSnapshot(city, adapter, resolved);
    const nowMs = resolved.now();
    const freshness = freshnessOf(adapter);
    const judged = judgePositions(snapshot.positions, nowMs, freshness);
    return {
      city,
      county: adapter.county,
      status: "ok",
      reason: null,
      trucks: judged.trucks,
      hiddenCount: judged.hiddenCount,
      freshness,
      dataAsOf: judged.dataAsOf,
      fetchedAt: new Date(snapshot.fetchedAtMs).toISOString(),
      source: sourceOf(adapter),
    };
  } catch (error) {
    return unavailable(error instanceof LiveUpstreamError ? error.reason : "network");
  }
}

/** Live positions for several cities (default: every registered one), each degrading on its own. */
export async function getLiveTrucksForCities(
  cities: readonly LiveTruckCity[] = LIVE_TRUCK_CITIES,
  deps: LiveDeps = {},
): Promise<LiveTrucksResponse> {
  const now = deps.now ?? Date.now;
  const results = await Promise.all(cities.map((city) => getLiveTrucks(city, deps)));
  return { generatedAt: new Date(now()).toISOString(), cities: results };
}
