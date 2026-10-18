import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { ensureSchema, getPool } from "@/lib/server/db/mysql";
import type { YouBikeStaticStation, YouBikeStation } from "./types";

/**
 * MySQL side of the YouBike syncs. Everything the sync logic needs from the database is here, so
 * the logic itself (tdxSyncCore.ts, runSync.ts) can be driven with fakes.
 */

const BATCH_SIZE = 200;

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

/** Batched upsert of live + static columns; the same statement the sync has always used. Returns the row count written. */
export async function upsertYouBikeStations(stations: YouBikeStation[]): Promise<number> {
  if (stations.length === 0) return 0;
  const pool = getPool();
  if (!pool) return 0;

  for (let i = 0; i < stations.length; i += BATCH_SIZE) {
    const chunk = stations.slice(i, i + BATCH_SIZE);
    const values = chunk.map((s) => [
      s.cityCode,
      s.stationNo,
      s.nameTw,
      s.districtTw,
      s.addressTw,
      s.lat,
      s.lng,
      s.totalSpaces,
      s.availableBikes,
      s.availableEbikes,
      s.emptySpaces,
      s.isActive,
      s.updatedAtSource,
      new Date(),
    ]);

    await pool.query(
      `INSERT INTO youbike_stations (
        city_code, station_no, name_tw, district_tw, address_tw,
        lat, lng, total_spaces, available_bikes, available_ebikes,
        empty_spaces, is_active, updated_at_source, updated_at
      ) VALUES ?
      ON DUPLICATE KEY UPDATE
        name_tw = VALUES(name_tw),
        district_tw = VALUES(district_tw),
        address_tw = VALUES(address_tw),
        lat = VALUES(lat),
        lng = VALUES(lng),
        total_spaces = VALUES(total_spaces),
        available_bikes = VALUES(available_bikes),
        available_ebikes = VALUES(available_ebikes),
        empty_spaces = VALUES(empty_spaces),
        is_active = VALUES(is_active),
        updated_at_source = VALUES(updated_at_source),
        updated_at = NOW()`,
      [values],
    );
  }
  return stations.length;
}

/**
 * The stored static half (name, district, address, coordinates, dock count) of every station in
 * these cities. Creates the tables first if they are missing, so the very first TDX round after a
 * deploy does not depend on some page render having run the migrations.
 */
export async function loadYouBikeStaticStations(
  cityCodes: readonly string[],
): Promise<Map<string, YouBikeStaticStation[]>> {
  await ensureSchema();
  const byCity = new Map<string, YouBikeStaticStation[]>();
  if (cityCodes.length === 0) return byCity;

  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       city_code AS cityCode,
       station_no AS stationNo,
       name_tw AS nameTw,
       district_tw AS districtTw,
       address_tw AS addressTw,
       CAST(lat AS DOUBLE) AS lat,
       CAST(lng AS DOUBLE) AS lng,
       total_spaces AS totalSpaces
     FROM youbike_stations
     WHERE city_code IN (?)`,
    [cityCodes],
  );
  for (const row of rows ?? []) {
    const list = byCity.get(row.cityCode) ?? [];
    list.push({
      stationNo: String(row.stationNo),
      nameTw: row.nameTw ?? "",
      districtTw: row.districtTw ?? "",
      addressTw: row.addressTw ?? "",
      lat: Number(row.lat),
      lng: Number(row.lng),
      totalSpaces: Number(row.totalSpaces) || 0,
    });
    byCity.set(row.cityCode, list);
  }
  return byCity;
}

/** When each city's Bike/Station list was last loaded from TDX (epoch ms). A city with no row has never been. */
export async function loadYouBikeStaticRefreshTimes(): Promise<Map<string, number>> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT city_code, static_refreshed_at FROM youbike_sync_state",
  );
  const times = new Map<string, number>();
  for (const row of rows ?? []) {
    const ms = parseDbDateMs(row.static_refreshed_at);
    if (ms !== null) times.set(String(row.city_code), ms);
  }
  return times;
}

/** Records that these cities' Bike/Station list was just loaded. One row per city, keyed by city_code alone. */
export async function recordYouBikeStaticRefresh(cityCodes: string[], atMs: number): Promise<void> {
  if (cityCodes.length === 0) return;
  const at = toSqlDateTimeUtc(atMs);
  await getPool().query(
    `INSERT INTO youbike_sync_state (city_code, static_refreshed_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE static_refreshed_at = VALUES(static_refreshed_at)`,
    [cityCodes.map((code) => [code, at])],
  );
}
