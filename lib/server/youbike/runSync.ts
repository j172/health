import "server-only";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { describeTdxBreaker, tdxCircuitBreaker } from "@/lib/server/tdx/circuitBreaker";
import {
  fetchHsinchuDirect,
  fetchNewTaipeiDirect,
  fetchTaipeiDirect,
  withCooldown,
  type DirectFetchResult,
} from "./directSources";
import {
  loadYouBikeStaticRefreshTimes,
  loadYouBikeStaticStations,
  recordYouBikeStaticRefresh,
  upsertYouBikeStations,
} from "./syncStore";
import { fetchTdxAvailability, fetchTdxStationList, TDX_SYNCED_CITY_CODES } from "./tdxClient";
import { runTdxCitiesSync } from "./tdxSyncCore";
import type { YouBikeStation, YouBikeSyncSummary } from "./types";

export type { YouBikeSyncSummary } from "./types";

/**
 * Two jobs share the youbike_stations table (lib/server/cron/registerJobs.ts):
 *
 *   runYouBikeDirectSync  every 5 minutes   Taipei + New Taipei, from their free open-data feeds.
 *                                           No TDX involved, so no quota and no limiter queue.
 *   runYouBikeTdxSync     every ~15 minutes the other 13 cities from TDX: Bike/Availability only,
 *                                           static data from the database (tdxSyncCore.ts).
 *
 * Before this split a single five-minute job pulled all 15 cities through TDX (30 requests a round,
 * ~4,300 a day) — including Taipei and New Taipei, whose free feeds were only a fallback for when
 * TDX was down. They are now the primary source, and TDX is asked for what only it provides.
 */

export interface YouBikeDirectDeps {
  fetchTaipei: () => Promise<DirectFetchResult>;
  fetchNewTaipei: () => Promise<DirectFetchResult>;
  upsertStations: (stations: YouBikeStation[]) => Promise<number>;
}

const defaultDirectDeps: YouBikeDirectDeps = {
  fetchTaipei: () => fetchTaipeiDirect(),
  fetchNewTaipei: () => fetchNewTaipeiDirect(),
  upsertStations: upsertYouBikeStations,
};

export async function runYouBikeDirectSync(deps: YouBikeDirectDeps = defaultDirectDeps): Promise<YouBikeSyncSummary> {
  const summary: YouBikeSyncSummary = {
    ok: true,
    totalUpserted: 0,
    cities: { TPE: 0, NTPC: 0 },
    errors: [],
    source: "direct",
  };

  const allStations: YouBikeStation[] = [];

  const taipei = await deps.fetchTaipei();
  allStations.push(...taipei.stations);
  summary.cities.TPE = taipei.stations.length;
  if (taipei.error) summary.errors.push(taipei.error);

  const newTaipei = await deps.fetchNewTaipei();
  allStations.push(...newTaipei.stations);
  summary.cities.NTPC = newTaipei.stations.length;
  if (newTaipei.error) summary.errors.push(newTaipei.error);

  if (allStations.length > 0) {
    try {
      summary.totalUpserted = await deps.upsertStations(allStations);
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      summary.errors.push(`MySQL upsert error: ${msg}`);
      summary.ok = false;
    }
  }

  if (summary.errors.length > 0 && allStations.length === 0) {
    summary.ok = false;
  }

  return summary;
}

/** Hsinchu's open-data host is almost always unreachable: one attempt an hour is plenty. */
const fetchHsinchuWithCooldown = withCooldown(() => fetchHsinchuDirect());

/** Cities whose last Bike/Station request failed, kept for the life of the process (see tdxSyncCore.ts). */
const stationReloadFailures = new Map<string, number>();

export async function runYouBikeTdxSync(): Promise<YouBikeSyncSummary> {
  return runTdxCitiesSync(
    {
      now: () => Date.now(),
      getToken: getTdxToken,
      explainNoToken: () => `no usable TDX token: credentials missing, token request refused, or ${describeTdxBreaker()}`,
      isTdxBlocked: () => tdxCircuitBreaker.isBlocked(),
      fetchStationList: fetchTdxStationList,
      fetchAvailability: fetchTdxAvailability,
      loadStaticStations: loadYouBikeStaticStations,
      loadStaticRefreshTimes: loadYouBikeStaticRefreshTimes,
      upsertStations: upsertYouBikeStations,
      recordStaticRefresh: recordYouBikeStaticRefresh,
      fetchHsinchuDirect: fetchHsinchuWithCooldown,
    },
    { cityCodes: TDX_SYNCED_CITY_CODES, reloadFailures: stationReloadFailures },
  );
}
