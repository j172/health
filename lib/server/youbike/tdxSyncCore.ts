import type { DirectFetchResult } from "./directSources";
import {
  buildStationsFromTdx,
  mergeAvailabilityWithStatic,
  type TdxAvailabilityItem,
  type TdxStationItem,
} from "./tdxStations";
import type { YouBikeStaticStation, YouBikeStation, YouBikeSyncSummary, YouBikeTdxRoundStats } from "./types";

/**
 * The YouBike TDX round — every city TDX serves except Taipei and New Taipei (those two come from
 * free open data, see runSync.ts).
 *
 * The old round asked TDX for BOTH Bike/Station and Bike/Availability for all 15 cities every five
 * minutes: 30 requests, about 4,300 a day, 80% of everything this site sends to TDX — most of it
 * re-downloading names and coordinates that do not change. Now a round costs one Availability
 * request per city, and the static half comes from `youbike_stations`:
 *
 *   - Bike/Station is fetched for a city only when (a) its static data was never loaded or was last
 *     loaded more than STATION_REFRESH_INTERVAL_MS ago (the time is in `youbike_sync_state`, so it
 *     survives a process restart), or (b) Availability names a StationID the database does not know
 *     (a new station), at most once per UNKNOWN_STATION_REFRESH_COOLDOWN_MS per city so a
 *     permanently orphaned ID cannot cost a request every round;
 *   - a whole round never sends more than MAX_STATION_REQUESTS_PER_RUN Station requests. The first
 *     round after a fresh deploy (13 cities due at once) therefore takes a few rounds to load them
 *     all, and afterwards the cities fall due at staggered times instead of in one burst;
 *   - a city whose Station request failed is not retried for UNKNOWN_STATION_REFRESH_COOLDOWN_MS, so
 *     one broken endpoint cannot cost a request every round or crowd the others out of the cap;
 *   - one city failing never affects another (Promise.allSettled), and each batch of cities is
 *     written before the next is requested, so a process killed mid-round keeps what it fetched.
 *
 * Steady state is 13 requests per round, 4 rounds an hour: about 1,250 a day.
 *
 * Everything outside this file is injected (YouBikeTdxEdges), so the tests drive it with fakes.
 */

export const STATION_REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
export const UNKNOWN_STATION_REFRESH_COOLDOWN_MS = 60 * 60_000;
export const MAX_STATION_REQUESTS_PER_RUN = 3;
/** Cities requested together; the shared limiter still spaces the requests 13 s apart. */
export const CITY_BATCH_SIZE = 3;

export interface YouBikeTdxEdges {
  now(): number;
  getToken(): Promise<string | null>;
  /** One secret-free sentence saying why there is no token (credentials missing, request refused, breaker open). */
  explainNoToken(): string;
  /** True while the TDX circuit breaker is refusing requests: checked between batches so a trip stops the round. */
  isTdxBlocked(): boolean;
  fetchStationList(cityCode: string, token: string): Promise<TdxStationItem[]>;
  fetchAvailability(cityCode: string, token: string): Promise<TdxAvailabilityItem[]>;
  loadStaticStations(cityCodes: readonly string[]): Promise<Map<string, YouBikeStaticStation[]>>;
  /** When each city's static data was last loaded from TDX (epoch ms); a city with no entry has never been. */
  loadStaticRefreshTimes(): Promise<Map<string, number>>;
  upsertStations(stations: YouBikeStation[]): Promise<number>;
  recordStaticRefresh(cityCodes: string[], atMs: number): Promise<void>;
  fetchHsinchuDirect(): Promise<DirectFetchResult>;
}

export interface YouBikeTdxRoundOptions {
  /** The TDX-served cities, in processing order (Hsinchu early so its fallback overlaps the rest of the round). */
  cityCodes: readonly string[];
  maxStationRequests?: number;
  refreshIntervalMs?: number;
  unknownRefreshCooldownMs?: number;
  batchSize?: number;
  /**
   * When each city's last Station request FAILED (epoch ms), owned by the caller so it outlives one
   * round. Omitted = no memory between rounds.
   */
  reloadFailures?: Map<string, number>;
}

/** The synthetic rows the Hsinchu open-data fallback writes (`HSC_1`, `HSC_2`, ...) are not TDX stations. */
const isFallbackPlaceholder = (stationNo: string): boolean => /^HSC_\d+$/.test(stationNo);

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export interface CityPlan {
  /** Cities whose Station list is loaded this round, cities with nothing stored first, then the longest overdue (capped). */
  refresh: string[];
  /** Cities that need a first load but did not fit under the cap (or failed recently): nothing can be written for them yet. */
  deferred: string[];
  /** Station requests left over for unknown-StationID reloads. */
  supplementBudget: number;
}

/** Decides which cities need Bike/Station this round. Pure. */
export function planCityRound(input: {
  cityCodes: readonly string[];
  /** Stored station count per city (placeholders excluded). */
  storedCounts: ReadonlyMap<string, number>;
  lastRefreshMs: ReadonlyMap<string, number>;
  /** Cities whose last Station request failed, with the time of that failure. */
  recentFailureMs?: ReadonlyMap<string, number>;
  failureCooldownMs?: number;
  nowMs: number;
  maxStationRequests: number;
  refreshIntervalMs: number;
}): CityPlan {
  const due: { code: string; empty: boolean; lastMs: number }[] = [];
  const failedRecently: { code: string; empty: boolean }[] = [];
  for (const code of input.cityCodes) {
    const empty = (input.storedCounts.get(code) ?? 0) === 0;
    const last = input.lastRefreshMs.get(code);
    // "Empty" alone does not make a city due: a city TDX answers 200 [] for is recorded as loaded and
    // simply has no stations; only the reload time says whether it needs asking again.
    const stale = last === undefined || input.nowMs - last >= input.refreshIntervalMs;
    if (!stale) continue;
    const failedAt = input.recentFailureMs?.get(code);
    if (failedAt !== undefined && input.nowMs - failedAt < (input.failureCooldownMs ?? 0)) {
      failedRecently.push({ code, empty });
      continue;
    }
    due.push({ code, empty, lastMs: last ?? Number.NEGATIVE_INFINITY });
  }
  // Cities with nothing stored first (they cannot be written at all), then the longest-overdue.
  due.sort((a, b) => {
    if (a.empty !== b.empty) return a.empty ? -1 : 1;
    return a.lastMs < b.lastMs ? -1 : a.lastMs > b.lastMs ? 1 : 0;
  });
  const cap = Math.max(0, input.maxStationRequests);
  const refresh = due.slice(0, cap).map((d) => d.code);
  const deferred = [...due.slice(cap), ...failedRecently].filter((d) => d.empty).map((d) => d.code);
  return { refresh, deferred, supplementBudget: cap - refresh.length };
}

export async function runTdxCitiesSync(
  edges: YouBikeTdxEdges,
  options: YouBikeTdxRoundOptions,
): Promise<YouBikeSyncSummary> {
  const cityCodes = options.cityCodes;
  const maxStationRequests = options.maxStationRequests ?? MAX_STATION_REQUESTS_PER_RUN;
  const refreshIntervalMs = options.refreshIntervalMs ?? STATION_REFRESH_INTERVAL_MS;
  const reloadCooldownMs = options.unknownRefreshCooldownMs ?? UNKNOWN_STATION_REFRESH_COOLDOWN_MS;
  const batchSize = Math.max(1, options.batchSize ?? CITY_BATCH_SIZE);
  const reloadFailures = options.reloadFailures ?? new Map<string, number>();

  const stats: YouBikeTdxRoundStats = { availabilityCalls: 0, stationCalls: 0, refreshedCities: [], deferredCities: [] };
  const summary: YouBikeSyncSummary = { ok: true, totalUpserted: 0, cities: {}, errors: [], source: "tdx", tdx: stats };
  for (const code of cityCodes) summary.cities[code] = 0;
  let tdxStations = 0;

  // 1. What the database already knows. Read before any TDX request: if it cannot be read there is
  // nowhere to merge into and nowhere to write, so asking TDX for anything would only burn quota.
  let staticByCity: Map<string, YouBikeStaticStation[]>;
  try {
    staticByCity = await edges.loadStaticStations(cityCodes);
  } catch (err) {
    summary.ok = false;
    summary.errors.push(`MySQL read error: ${errorMessage(err)}`);
    return summary;
  }
  const storedOf = (code: string): YouBikeStaticStation[] =>
    (staticByCity.get(code) ?? []).filter((s) => !isFallbackPlaceholder(s.stationNo));

  let lastRefresh = new Map<string, number>();
  try {
    lastRefresh = await edges.loadStaticRefreshTimes();
  } catch (err) {
    // Not fatal: every city then looks due, and the per-round Station cap keeps that cheap.
    summary.errors.push(`youbike_sync_state read failed (every city treated as due, capped per round): ${errorMessage(err)}`);
  }

  // 2. Hsinchu's open-data fallback. Only when TDX gives no Hsinchu stations AND the database has no
  // real TDX Hsinchu stations to keep showing — the fallback's rows are placeholders and must not
  // sit next to real ones. Started the moment the need is known so it overlaps the rest of the round.
  const hasRealHsinchu = storedOf("HSC").length > 0;
  let hsinchuStationsFromTdx = 0;
  let hsinchuFallback: Promise<DirectFetchResult> | null = null;
  const startHsinchuFallbackIfNeeded = (): void => {
    if (hsinchuFallback || !cityCodes.includes("HSC") || hsinchuStationsFromTdx > 0 || hasRealHsinchu) return;
    hsinchuFallback = edges
      .fetchHsinchuDirect()
      .catch((err: unknown) => ({ stations: [], error: `Hsinchu fetch failed: ${errorMessage(err)}` }));
  };

  // Writes a batch, then (only if that worked) remembers which cities had their static data reloaded.
  let writeFailed = false;
  const persist = async (stations: YouBikeStation[], refreshedCities: string[]): Promise<void> => {
    if (stations.length > 0) {
      try {
        summary.totalUpserted += await edges.upsertStations(stations);
      } catch (err) {
        summary.errors.push(`MySQL upsert error: ${errorMessage(err)}`);
        summary.ok = false;
        writeFailed = true;
        return;
      }
    }
    if (refreshedCities.length > 0) {
      stats.refreshedCities.push(...refreshedCities);
      try {
        await edges.recordStaticRefresh(refreshedCities, edges.now());
      } catch (err) {
        summary.errors.push(`youbike_sync_state write failed (these cities reload next round): ${errorMessage(err)}`);
      }
    }
  };

  // 3. The token. Without one (credentials missing, request refused, breaker open) the 13 cities are
  // simply not updated this round; nothing is requested.
  let token: string | null = null;
  try {
    token = await edges.getToken();
  } catch (err) {
    summary.errors.push(`TDX sync failed: ${errorMessage(err)}`);
  }

  if (token) {
    const plan = planCityRound({
      cityCodes,
      storedCounts: new Map(cityCodes.map((code) => [code, storedOf(code).length])),
      lastRefreshMs: lastRefresh,
      recentFailureMs: reloadFailures,
      failureCooldownMs: reloadCooldownMs,
      nowMs: edges.now(),
      maxStationRequests,
      refreshIntervalMs,
    });
    stats.deferredCities = plan.deferred;
    const refreshNow = new Set(plan.refresh);
    const deferred = new Set(plan.deferred);
    let supplementBudget = plan.supplementBudget;

    /** Station list for one city, joined with the Availability already in hand. */
    const reloadStatic = async (
      code: string,
      availability: TdxAvailabilityItem[],
    ): Promise<{ stations: YouBikeStation[]; refreshed: boolean }> => {
      stats.stationCalls += 1;
      let stationList: TdxStationItem[];
      try {
        stationList = await edges.fetchStationList(code, token as string);
      } catch (err) {
        reloadFailures.set(code, edges.now());
        // Availability is good and so is what is stored: keep going on the stored static data.
        if (storedOf(code).length === 0) throw err;
        summary.errors.push(`TDX Station reload failed for ${code} (kept the stored static data): ${errorMessage(err)}`);
        return { stations: mergeAvailabilityWithStatic(code, availability, storedOf(code)).stations, refreshed: false };
      }
      reloadFailures.delete(code);
      return { stations: buildStationsFromTdx(code, stationList, availability), refreshed: true };
    };

    const syncCity = async (code: string): Promise<{ stations: YouBikeStation[]; refreshed: boolean }> => {
      stats.availabilityCalls += 1;
      const availability = await edges.fetchAvailability(code, token as string);
      if (refreshNow.has(code)) return reloadStatic(code, availability);

      const merged = mergeAvailabilityWithStatic(code, availability, storedOf(code));
      if (merged.unknownStationNos.length === 0) return { stations: merged.stations, refreshed: false };

      // A StationID the database has never seen: load this city's Station list — but within the
      // round's Station budget, not for a city reloaded (or failed) within the cooldown, so an ID
      // that Station itself never lists cannot cost a request every single round.
      const last = lastRefresh.get(code);
      const failedAt = reloadFailures.get(code);
      const now = edges.now();
      const cooledDown =
        (last === undefined || now - last >= reloadCooldownMs) &&
        (failedAt === undefined || now - failedAt >= reloadCooldownMs);
      if (supplementBudget <= 0 || !cooledDown) return { stations: merged.stations, refreshed: false };
      supplementBudget -= 1;
      return reloadStatic(code, availability);
    };

    if (deferred.has("HSC")) startHsinchuFallbackIfNeeded();

    const todo = cityCodes.filter((code) => !deferred.has(code));
    for (let i = 0; i < todo.length && !writeFailed; i += batchSize) {
      if (edges.isTdxBlocked()) {
        const skipped = todo.slice(i);
        summary.errors.push(`TDX circuit breaker opened during the round; skipped ${skipped.length} cities: ${skipped.join(", ")}`);
        break;
      }

      const batch = todo.slice(i, i + batchSize);
      const settled = await Promise.allSettled(batch.map((code) => syncCity(code)));
      const batchStations: YouBikeStation[] = [];
      const batchRefreshed: string[] = [];
      settled.forEach((result, index) => {
        const code = batch[index];
        if (result.status === "fulfilled") {
          summary.cities[code] = result.value.stations.length;
          tdxStations += result.value.stations.length;
          batchStations.push(...result.value.stations);
          if (result.value.refreshed) batchRefreshed.push(code);
          if (code === "HSC") hsinchuStationsFromTdx = result.value.stations.length;
        } else {
          summary.errors.push(`TDX fetch failed for ${code}: ${errorMessage(result.reason)}`);
        }
      });
      await persist(batchStations, batchRefreshed);
      if (batch.includes("HSC")) startHsinchuFallbackIfNeeded();
    }
  } else {
    summary.errors.push(`TDX unavailable (${edges.explainNoToken()}); ${cityCodes.length} cities were not updated`);
  }

  // 4. Hsinchu open-data fallback result (also the only Hsinchu data when there is no token at all).
  if (!writeFailed) startHsinchuFallbackIfNeeded();
  const fallback = hsinchuFallback ? await (hsinchuFallback as Promise<DirectFetchResult>) : null;
  let fallbackStations = 0;
  if (fallback) {
    if (fallback.error) summary.errors.push(fallback.error);
    if (fallback.stations.length > 0 && !writeFailed) {
      fallbackStations = fallback.stations.length;
      summary.cities.HSC = fallbackStations;
      await persist(fallback.stations, []);
    }
  }
  if (fallbackStations > 0 && tdxStations === 0) summary.source = "direct_fallback";

  if (summary.errors.length > 0 && tdxStations + fallbackStations === 0) summary.ok = false;
  return summary;
}
