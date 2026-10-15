/**
 * Minimum magnitude for writing an incoming earthquake event to
 * global_earthquakes at all (issue #582). USGS's `all_hour` feed includes
 * every microquake it sees (e.g. a M0.5 in California) and EMSC's poll
 * pulls 100 events every cycle regardless of size, but no reader of this
 * table ever displays anything below M4.0 (CWA-tier) or M6.0 (worldwide
 * tier) — see getTieredEarthquakes/getRecentSignificantEarthquakes in
 * queries.ts. Writing sub-threshold rows just feeds the same
 * unbounded-table-growth pattern that took down every DB-backed /api/*
 * route on 2026-09-21 (cwa_station_weather and friends — see
 * docs/archive/specs/cwa-station-weather-duplicate-row-cleanup.md).
 *
 * M2.5 sits comfortably below every current display floor (M4.0/M6.0) and
 * below the planned M4.5 floor for the future Dynamic Earth feature, so
 * this threshold shouldn't need revisiting when that ships.
 */
export const MIN_WRITE_MAGNITUDE = 2.5;

/**
 * Whether an incoming earthquake event is worth writing to the DB at all.
 * Events with no reported magnitude (`null`) are dropped along with
 * everything below MIN_WRITE_MAGNITUDE — a missing magnitude can't be
 * proven to clear the threshold, so it's treated the same as failing it.
 */
export const meetsWriteThreshold = (magnitude: number | null): boolean =>
  magnitude != null && magnitude >= MIN_WRITE_MAGNITUDE;
