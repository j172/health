import type { GarbageRouteCity } from "@/lib/tools/garbageTrucks/coverage";

export type { GarbageRouteCity };

/**
 * One stop on one garbage-truck trip — the row shape of garbage_route_stops
 * (issue #674 / B-16), identical for every city so the UI never branches on
 * which dataset a row came from. Fields a city's dataset does not carry are
 * null, never invented: Taipei (136515) has trip/team and arrive+depart times
 * but no weekday flags; New Taipei (125664) has weekday flags but no trip,
 * team or departure time.
 */
export interface GarbageRouteStopRecord {
  city: GarbageRouteCity;
  /** Stable id of one line/trip inside the city. Taipei: `局編:路線:車次`; New Taipei: the dataset's `lineid`. */
  lineId: string;
  /** 1-based order of this stop inside its line. Part of the UNIQUE KEY together with city + lineId. */
  stopRank: number;
  lineName: string;
  /** Taipei's 車次 ("第1車"). */
  tripLabel: string | null;
  /** Taipei's 分隊 ("天母分隊"). */
  team: string | null;
  district: string;
  village: string | null;
  stopName: string;
  lat: number;
  lng: number;
  /** "HH:MM"; the hour may be >= 24 for trips that run past midnight. */
  arriveTime: string | null;
  departTime: string | null;
  /** Weekday bitmask, bit 0 = Sunday. null = the source carries no weekday info; 0 = explicitly none. */
  garbageDays: number | null;
  recyclingDays: number | null;
  foodscrapsDays: number | null;
  memo: string | null;
}

/** The two phases a source reports from inside fetch(), so the sync can log memory at each. */
export type GarbageRouteFetchStage = "after_fetch" | "after_parse";

export interface GarbageRouteFetchHooks {
  /** Called once the body is downloaded ("after_fetch") and once it is parsed ("after_parse"). */
  onStage?: (stage: GarbageRouteFetchStage, detail?: Record<string, number>) => void;
}

/** One configured upstream: what to fetch and how to turn it into rows for one city. */
export interface GarbageRouteSource {
  city: GarbageRouteCity;
  /** ingest_errors.feed_code and run-summary label. */
  sourceKey: string;
  fetch: (hooks?: GarbageRouteFetchHooks) => Promise<GarbageRouteStopRecord[]>;
}
