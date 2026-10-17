import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { parseTdxCoordinate } from "@/lib/server/tdx/seniors";
import { RAIL_SYSTEMS, type RailSystem } from "./railStationCounty";
import type { RailSyncStore, RailSystemAttempt, StationRecord } from "./railSyncCore";
import type { SeniorStationMap, SeniorStationTransfer } from "./tdxSeniorClient";

/**
 * MySQL side of the per-system TDX Senior/Rail sync (issue #704; the logic that
 * decides WHEN to write lives in railSyncCore.ts).
 *
 * Every statement here is scoped to one RailSystem:
 *   - stations: upsert on the table's own UNIQUE KEY (station_id, system_type);
 *   - maps / transfers: DELETE WHERE rail_system = ? and the re-INSERT run in one
 *     transaction, so a process killed halfway rolls back to the previous rows
 *     instead of leaving a system with none, and no other system's rows are read
 *     or touched;
 *   - state: one row per system, keyed by rail_system alone (no time column in any key).
 */

/** Rows per multi-row INSERT, and a ceiling on the text in one statement (WKT geometry can be large). */
const INSERT_BATCH_MAX_ROWS = 200;
const INSERT_BATCH_MAX_CHARS = 1_000_000;

const approxChars = (values: unknown[]): number =>
  values.reduce<number>((sum, value) => sum + (typeof value === "string" ? value.length : 8), 0);

/** Splits rows into batches bounded by both row count and total text size. */
export function chunkRowValues(
  rows: unknown[][],
  maxRows: number = INSERT_BATCH_MAX_ROWS,
  maxChars: number = INSERT_BATCH_MAX_CHARS,
): unknown[][][] {
  const batches: unknown[][][] = [];
  let current: unknown[][] = [];
  let currentChars = 0;
  for (const row of rows) {
    const size = approxChars(row);
    if (current.length > 0 && (current.length >= maxRows || currentChars + size > maxChars)) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(row);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const toSqlDateTimeUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

const parseDbDateMs = (value: unknown): number | null => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "string" && value.trim() !== "") {
    // The pool runs with timezone "Z"; a string here is a UTC DATETIME.
    const ms = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

const MAP_TABLE = "accessible_transit_station_maps";
const TRANSFER_TABLE = "accessible_transit_transfers";

export function createMysqlRailSyncStore(pool: Pick<Pool, "query" | "getConnection">): RailSyncStore {
  const count = async (table: string, system: RailSystem): Promise<number> => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ${table} WHERE rail_system = ?`,
      [system],
    );
    return Number(rows?.[0]?.total ?? 0);
  };

  /** DELETE this system's rows and INSERT the new ones atomically. */
  const replaceSystemRows = async (
    table: string,
    insertSql: string,
    system: RailSystem,
    values: unknown[][],
  ): Promise<number> => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`DELETE FROM ${table} WHERE rail_system = ?`, [system]);
      for (const batch of chunkRowValues(values)) {
        await conn.query(insertSql, [batch]);
      }
      await conn.commit();
      return values.length;
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        // The connection is already gone; MySQL discards the open transaction with it.
      }
      throw err;
    } finally {
      conn.release();
    }
  };

  return {
    async loadLastSuccess() {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT rail_system, last_success_at FROM accessible_transit_sync_state",
      );
      const known = new Set<string>(RAIL_SYSTEMS);
      const out = new Map<RailSystem, number>();
      for (const row of rows ?? []) {
        const ms = parseDbDateMs(row.last_success_at);
        if (ms !== null && known.has(row.rail_system)) out.set(row.rail_system as RailSystem, ms);
      }
      return out;
    },

    // `system` only scopes the call for the caller; each record already carries its own
    // (station_id, system_type) identity, which is what the UNIQUE KEY upserts on.
    async upsertStations(system: RailSystem, stations: StationRecord[]) {
      let upserted = 0;
      for (const s of stations) {
        await pool.query(
          `INSERT INTO accessible_transit_facilities
            (county, system_type, station_or_agency, facility_name, service_phone, booking_rules, features_json, source, station_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'tdx_senior', ?)
           ON DUPLICATE KEY UPDATE
             county = VALUES(county),
             station_or_agency = VALUES(station_or_agency),
             facility_name = VALUES(facility_name),
             service_phone = VALUES(service_phone),
             booking_rules = VALUES(booking_rules),
             features_json = VALUES(features_json),
             source = 'tdx_senior',
             updated_at = NOW()`,
          [
            s.county,
            s.systemType,
            s.stationName,
            `${s.stationName} 無障礙設施`,
            s.servicePhone,
            s.bookingRules,
            s.featuresJson,
            s.stationId,
          ],
        );
        upserted += 1;
      }
      return upserted;
    },

    countMaps: (system: RailSystem) => count(MAP_TABLE, system),
    countTransfers: (system: RailSystem) => count(TRANSFER_TABLE, system),

    replaceMaps(system: RailSystem, maps: SeniorStationMap[]) {
      const values = maps.map((map) => [
        system,
        map.StationID,
        map.StationName || map.StationID,
        map.FloorLevel || null,
        map.MapName || null,
        map.MapURL || null,
        map.Geometry || null,
      ]);
      return replaceSystemRows(
        MAP_TABLE,
        `INSERT INTO ${MAP_TABLE}
          (rail_system, station_id, station_name, floor_level, map_name, map_url, geometry)
         VALUES ?`,
        system,
        values,
      );
    },

    replaceTransfers(system: RailSystem, transfers: SeniorStationTransfer[]) {
      const values = transfers.map((transfer) => [
        system,
        transfer.StationID,
        transfer.StationName || transfer.StationID,
        transfer.FloorLevel || null,
        transfer.ExitID || null,
        transfer.ExitName || null,
        parseTdxCoordinate(transfer.PositionLat),
        parseTdxCoordinate(transfer.PositionLon),
        transfer.TransferMode || null,
        transfer.TransferRouteDescription || null,
        transfer.TransferDescription || null,
        transfer.IsOnSiteTransfer ? 1 : 0,
      ]);
      return replaceSystemRows(
        TRANSFER_TABLE,
        `INSERT INTO ${TRANSFER_TABLE}
          (rail_system, station_id, station_name, floor_level, exit_id, exit_name, lat, lng,
           transfer_mode, transfer_route_description, transfer_description, is_onsite_transfer)
         VALUES ?`,
        system,
        values,
      );
    },

    async recordAttempt(system: RailSystem, attempt: RailSystemAttempt) {
      const attemptedAt = toSqlDateTimeUtc(attempt.attemptedAtMs);
      await pool.query(
        `INSERT INTO accessible_transit_sync_state
          (rail_system, last_success_at, last_attempt_at, last_error, stations_count, maps_count, transfers_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_success_at = COALESCE(VALUES(last_success_at), last_success_at),
           last_attempt_at = VALUES(last_attempt_at),
           last_error = VALUES(last_error),
           stations_count = VALUES(stations_count),
           maps_count = VALUES(maps_count),
           transfers_count = VALUES(transfers_count)`,
        [
          system,
          // NULL on a failed attempt: COALESCE above keeps the previous success time.
          attempt.success ? attemptedAt : null,
          attemptedAt,
          attempt.error ? attempt.error.slice(0, 500) : null,
          attempt.stations,
          attempt.maps,
          attempt.transfers,
        ],
      );
    },
  };
}
