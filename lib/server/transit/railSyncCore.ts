import { parseTdxCoordinate } from "@/lib/server/tdx/seniors";
import { decideSnapshotReconcile } from "@/lib/server/drugs/shortageSnapshot";
import type { JsonStageLogger } from "@/lib/server/sync/stageLog";
import { yieldToEventLoop } from "@/lib/server/sync/yieldToEventLoop";
import { RAIL_SYSTEM_FALLBACK_COUNTY, type RailSystem } from "./railStationCounty";
import {
  flattenFacilityCategories,
  type SeniorStationFacility,
  type SeniorStationService,
  type SeniorStationMap,
  type SeniorStationTransfer,
} from "./tdxSeniorClient";
import type { TransitSystemType } from "./types";

/**
 * The daily TDX Senior/Rail sync, one RailSystem at a time (issue #704).
 *
 * Why it is shaped like this: the whole sync is ~50 requests through TDX's
 * shared 5 req/min limiter, i.e. about 11 minutes, and the production web
 * process is SIGKILLed by the host roughly every 12 minutes (and on every
 * deploy). The first version collected every system in memory and wrote at the
 * very end, so a kill at minute 10 threw the whole day's work away — every day.
 * Now:
 *
 *   - each system is fetched and WRITTEN before the next one is requested, so a
 *     kill loses at most the system in flight (~1 minute of requests);
 *   - every write is idempotent (stations: upsert on (station_id, system_type);
 *     maps/transfers: one transaction per system that replaces only that
 *     system's rows), so re-running a half-finished system is harmless;
 *   - rows of a system are replaced only through the repo's snapshot-reconcile
 *     guard (decideSnapshotReconcile), and never when that system's fetch of
 *     that endpoint failed — a failed/shrunken fetch cannot empty the table and
 *     can never touch another system's rows;
 *   - the store remembers each system's last complete success, and the next run
 *     processes the stalest system first, so even if every run is killed after
 *     a few systems, all of them get refreshed within a few days;
 *   - every step writes one JSON stage line (heap/RSS included), so the pm2 log
 *     shows how far each run got.
 *
 * This module has no database or TDX imports of its own: both edges are
 * injected (RailTdxClient, RailSyncStore), which is what lets the tests drive
 * it with fakes.
 */

/** TRA/THSR keep their own TransitSystemType; every other RailSystem code in
 * this spec's scope is a metro/light-rail operator. */
export const systemTypeFor = (system: RailSystem): TransitSystemType => {
  if (system === "TRA") return "rail";
  if (system === "THSR") return "hsrail";
  return "metro";
};

const FACILITY_CATEGORY_LABELS: Record<string, string> = {
  Elevators: "無障礙電梯",
  Toilets: "無障礙廁所",
  AEDs: "AED",
  PowerBankRentalStations: "行動電源租借",
};

const categoryLabel = (category: string): string => FACILITY_CATEGORY_LABELS[category] || category;

export const SYNC_STAGE_EVENT = "transit_accessibility_sync_stage";

export interface StationAccumulator {
  stationId: string;
  stationName: string;
  county: string;
  facilityItems: ReturnType<typeof flattenFacilityCategories>;
  servicePhones: string[];
  serviceLines: string[];
  serviceItems: Array<{ serviceName?: string; serviceUrl?: string; servicePhone?: string }>;
}

/** One accessible_transit_facilities row, ready to bind. */
export interface StationRecord {
  stationId: string;
  stationName: string;
  county: string;
  systemType: TransitSystemType;
  servicePhone: string | null;
  bookingRules: string | null;
  featuresJson: string;
}

/** The TDX calls one RailSystem needs. All of them go through the shared 5 req/min limiter (see tdxSeniorClient.ts). */
export interface RailTdxClient {
  fetchStationCountyMap(system: RailSystem): Promise<Map<string, string>>;
  fetchFacility(system: RailSystem): Promise<SeniorStationFacility[]>;
  fetchService(system: RailSystem): Promise<SeniorStationService[]>;
  fetchMap(system: RailSystem): Promise<SeniorStationMap[]>;
  fetchTransfer(system: RailSystem): Promise<SeniorStationTransfer[]>;
}

export interface RailSystemAttempt {
  /** Every endpoint answered, every write landed, and no guard held anything back. */
  success: boolean;
  attemptedAtMs: number;
  error: string | null;
  stations: number;
  maps: number;
  transfers: number;
}

/** Everything the sync needs from the database. Every method is scoped to ONE RailSystem. */
export interface RailSyncStore {
  /** Epoch ms of each system's last complete success; systems that never completed are absent. */
  loadLastSuccess(): Promise<Map<RailSystem, number>>;
  upsertStations(system: RailSystem, stations: StationRecord[]): Promise<number>;
  countMaps(system: RailSystem): Promise<number>;
  /** Atomically replaces this system's maps (and only this system's). */
  replaceMaps(system: RailSystem, maps: SeniorStationMap[]): Promise<number>;
  countTransfers(system: RailSystem): Promise<number>;
  /** Atomically replaces this system's transfers (and only this system's). */
  replaceTransfers(system: RailSystem, transfers: SeniorStationTransfer[]): Promise<number>;
  recordAttempt(system: RailSystem, attempt: RailSystemAttempt): Promise<void>;
}

export interface RailSystemSyncResult {
  system: RailSystem;
  success: boolean;
  stationsUpserted: number;
  mapsWritten: number;
  transfersWritten: number;
  /** Why existing maps/transfers were deliberately left alone (empty or sharply shrunken fetch). */
  guardNotes: string[];
  errors: string[];
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Stalest-first processing order: systems that never completed come first (in
 * their declared order), then the ones whose last success is oldest. Ties keep
 * the declared order, so a fresh database walks TRA, THSR, TRTC, ... exactly like
 * the old fixed order did.
 */
export const orderSystemsStalestFirst = (
  systems: readonly RailSystem[],
  lastSuccessMs: ReadonlyMap<RailSystem, number>,
): RailSystem[] =>
  systems
    .map((system, index) => ({ system, index, last: lastSuccessMs.get(system) ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => (a.last === b.last ? a.index - b.index : a.last < b.last ? -1 : 1))
    .map((entry) => entry.system);

interface RailSystemFetch {
  stations: Map<string, StationAccumulator>;
  facilityOk: boolean;
  /** null = that endpoint failed (as opposed to answering with an empty list). */
  maps: SeniorStationMap[] | null;
  transfers: SeniorStationTransfer[] | null;
  errors: string[];
}

/**
 * Fetches one RailSystem's Facility + Service + Map + Transfer data (the four
 * endpoints TDX reports as daily-refresh / UpdateInterval=86400; the
 * Facility/Alert endpoint is the separately-scheduled job in runSync.ts). Every
 * call is individually try/caught so one endpoint failing is recorded as one
 * error and never aborts the others, while the result keeps "failed" apart from
 * "answered with nothing" — that difference is what decides whether existing rows
 * may be replaced.
 */
export async function fetchRailSystem(system: RailSystem, client: RailTdxClient): Promise<RailSystemFetch> {
  const errors: string[] = [];
  const stations = new Map<string, StationAccumulator>();
  let countyMap = new Map<string, string>();

  try {
    countyMap = await client.fetchStationCountyMap(system);
  } catch (err) {
    errors.push(`${system} station/county lookup failed: ${errorMessage(err)}`);
  }

  const countyFor = (stationId: string): string =>
    countyMap.get(stationId) || RAIL_SYSTEM_FALLBACK_COUNTY[system];

  const getOrCreate = (stationId: string, stationName: string): StationAccumulator => {
    let acc = stations.get(stationId);
    if (!acc) {
      acc = {
        stationId,
        stationName,
        county: countyFor(stationId),
        facilityItems: [],
        servicePhones: [],
        serviceLines: [],
        serviceItems: [],
      };
      stations.set(stationId, acc);
    }
    return acc;
  };

  let facilityOk = false;
  try {
    const facilities = await client.fetchFacility(system);
    for (const f of facilities) {
      if (!f.StationID) continue;
      const acc = getOrCreate(f.StationID, f.StationName || f.StationID);
      acc.facilityItems.push(...flattenFacilityCategories(f));
    }
    facilityOk = true;
  } catch (err) {
    errors.push(`${system} Facility fetch failed: ${errorMessage(err)}`);
  }

  try {
    const services = await client.fetchService(system);
    for (const s of services) {
      if (!s.StationID) continue;
      const acc = getOrCreate(s.StationID, s.StationName || s.StationID);
      if (s.ServicePhone) acc.servicePhones.push(s.ServicePhone);
      if (s.ServiceName) {
        acc.serviceLines.push(`${s.ServiceName}${s.Description ? `：${s.Description}` : ""}`);
      }
      acc.serviceItems.push({
        serviceName: s.ServiceName,
        serviceUrl: s.ServiceURL,
        servicePhone: s.ServicePhone,
      });
    }
  } catch (err) {
    errors.push(`${system} Service fetch failed: ${errorMessage(err)}`);
  }

  let maps: SeniorStationMap[] | null = null;
  try {
    maps = await client.fetchMap(system);
  } catch (err) {
    errors.push(`${system} Map fetch failed: ${errorMessage(err)}`);
  }

  let transfers: SeniorStationTransfer[] | null = null;
  try {
    transfers = await client.fetchTransfer(system);
  } catch (err) {
    errors.push(`${system} Transfer fetch failed: ${errorMessage(err)}`);
  }

  return { stations, facilityOk, maps, transfers, errors };
}

export const toStationRecord = (system: RailSystem, acc: StationAccumulator): StationRecord => {
  const tags = Array.from(new Set(acc.facilityItems.map(({ category }) => categoryLabel(category))));
  const items = acc.facilityItems.map(({ category, item }) => ({
    category,
    facilityName: item.FacilityName ?? null,
    floorLevel: item.FloorLevel ?? null,
    description: item.Description ?? null,
    exitName: item.ExitName ?? null,
    platformName: item.PlatformName ?? null,
    lat: parseTdxCoordinate(item.PositionLat),
    lng: parseTdxCoordinate(item.PositionLon),
  }));
  for (const s of acc.serviceItems) {
    if (s.serviceUrl) {
      items.push({
        category: "Service",
        facilityName: s.serviceName ?? null,
        floorLevel: null,
        description: s.serviceUrl,
        exitName: null,
        platformName: null,
        lat: null,
        lng: null,
      });
    }
  }

  return {
    stationId: acc.stationId,
    stationName: acc.stationName,
    county: acc.county,
    systemType: systemTypeFor(system),
    servicePhone: acc.servicePhones[0] || null,
    bookingRules: acc.serviceLines.length > 0 ? acc.serviceLines.join("\n") : null,
    featuresJson: JSON.stringify({ tags, items }),
  };
};

export interface RunRailSystemsOptions {
  systems: readonly RailSystem[];
  client: RailTdxClient;
  store: RailSyncStore;
  log: JsonStageLogger;
  now?: () => number;
  /** Test seam; defaults to a real hand-back to the event loop between systems. */
  yieldToLoop?: () => Promise<void>;
}

/**
 * Replaces one endpoint's rows for one system, but only when the fetch answered
 * and the snapshot looks complete. Returns how many rows were written, and a
 * note when stored rows were deliberately kept.
 */
async function replaceGuarded<Row extends { StationID: string }>(params: {
  label: string;
  system: RailSystem;
  fetched: Row[];
  count: () => Promise<number>;
  replace: (rows: Row[]) => Promise<number>;
}): Promise<{ written: number; note: string | null }> {
  const rows = params.fetched.filter((row) => Boolean(row.StationID));
  const existing = await params.count();

  if (rows.length === 0 && existing === 0) return { written: 0, note: null };

  const decision = decideSnapshotReconcile({ fetched: rows.length, existing, noDataPlaceholder: false });
  if (!decision.reconcile) {
    return { written: 0, note: `${params.system} ${params.label}: ${decision.reason}` };
  }
  return { written: await params.replace(rows), note: null };
}

async function syncOneRailSystem(
  system: RailSystem,
  { client, store, log, now = Date.now }: RunRailSystemsOptions,
): Promise<RailSystemSyncResult> {
  const result: RailSystemSyncResult = {
    system,
    success: false,
    stationsUpserted: 0,
    mapsWritten: 0,
    transfersWritten: 0,
    guardNotes: [],
    errors: [],
  };
  const attemptedAtMs = now();

  log("system_start", { system });

  const fetched = await fetchRailSystem(system, client);
  result.errors.push(...fetched.errors);
  log("system_fetched", {
    system,
    stations: fetched.stations.size,
    maps: fetched.maps?.length ?? null,
    transfers: fetched.transfers?.length ?? null,
    fetchErrors: fetched.errors.length,
  });

  // Stations. A station row blends Facility and Service data, so when the Facility
  // endpoint failed there is nothing trustworthy to write: leave the rows as they are
  // rather than replacing them with a Service-only skeleton.
  if (fetched.facilityOk) {
    try {
      const records = [...fetched.stations.values()].map((acc) => toStationRecord(system, acc));
      if (records.length > 0) result.stationsUpserted = await store.upsertStations(system, records);
    } catch (err) {
      result.errors.push(`${system} facilities upsert failed: ${errorMessage(err)}`);
    }
  }

  if (fetched.maps) {
    try {
      const { written, note } = await replaceGuarded({
        label: "station maps",
        system,
        fetched: fetched.maps,
        count: () => store.countMaps(system),
        replace: (rows) => store.replaceMaps(system, rows),
      });
      result.mapsWritten = written;
      if (note) result.guardNotes.push(note);
    } catch (err) {
      result.errors.push(`${system} station maps write failed: ${errorMessage(err)}`);
    }
  }

  if (fetched.transfers) {
    try {
      const { written, note } = await replaceGuarded({
        label: "transfers",
        system,
        fetched: fetched.transfers,
        count: () => store.countTransfers(system),
        replace: (rows) => store.replaceTransfers(system, rows),
      });
      result.transfersWritten = written;
      if (note) result.guardNotes.push(note);
    } catch (err) {
      result.errors.push(`${system} transfers write failed: ${errorMessage(err)}`);
    }
  }

  // A guard hold means "the fetch looked wrong": not a success, so this system stays
  // first in line for the next run instead of looking freshly synced.
  result.success = result.errors.length === 0 && result.guardNotes.length === 0;

  try {
    await store.recordAttempt(system, {
      success: result.success,
      attemptedAtMs,
      error: [...result.errors, ...result.guardNotes].join("; ") || null,
      stations: result.stationsUpserted,
      maps: result.mapsWritten,
      transfers: result.transfersWritten,
    });
  } catch (err) {
    // The data is already written; losing the bookkeeping only means this system is
    // retried early next time.
    result.errors.push(`${system} sync state not recorded: ${errorMessage(err)}`);
  }

  log(result.success ? "system_done" : "system_incomplete", {
    system,
    stationsUpserted: result.stationsUpserted,
    mapsWritten: result.mapsWritten,
    transfersWritten: result.transfersWritten,
    errors: result.errors.length,
    guardNotes: result.guardNotes.length,
  });

  return result;
}

/**
 * Walks the systems strictly one after another (the shared limiter would
 * serialize them anyway; parallel batches got HTTP 429 on the first live run),
 * stalest first, writing each before starting the next. Never throws: a system
 * that goes wrong becomes a result with errors and the loop moves on.
 */
export async function runRailSystemsSync(options: RunRailSystemsOptions): Promise<RailSystemSyncResult[]> {
  const { systems, store, log, yieldToLoop = yieldToEventLoop } = options;

  let lastSuccess: Map<RailSystem, number>;
  try {
    lastSuccess = await store.loadLastSuccess();
  } catch (err) {
    // Bookkeeping must never be the reason the data does not sync: fall back to the declared order.
    log("state_unavailable", { error: errorMessage(err) });
    lastSuccess = new Map();
  }

  const ordered = orderSystemsStalestFirst(systems, lastSuccess);
  log("sync_start", { order: ordered.join(",") });

  const results: RailSystemSyncResult[] = [];
  for (const system of ordered) {
    try {
      results.push(await syncOneRailSystem(system, options));
    } catch (err) {
      const message = errorMessage(err);
      log("system_failed", { system, error: message });
      results.push({
        system,
        success: false,
        stationsUpserted: 0,
        mapsWritten: 0,
        transfersWritten: 0,
        guardNotes: [],
        errors: [`${system} sync failed: ${message}`],
      });
    }
    // Let the event loop (site traffic, health probes, the collector) catch up before the next system's requests.
    await yieldToLoop();
  }

  log("sync_done", {
    systems: results.length,
    succeeded: results.filter((r) => r.success).length,
  });
  return results;
}
