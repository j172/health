import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { memoizeQuery } from "@/lib/server/cache/memo";
import type { GarbageRouteCity, GarbageRouteStopRecord } from "@/lib/server/garbageRoutes/types";
import { escapeLike, type GarbageRouteSearchParams } from "@/lib/server/garbageRoutes/searchParams";

/**
 * Upserts one city's stops keyed by (city, line_id, stop_rank) — matches
 * garbage_route_stops' UNIQUE KEY in schema.ts. Every display column is
 * overwritten on every sync (a changed timetable replaces the row), and
 * synced_at is refreshed so rows a later run no longer sees can be pruned —
 * see pruneUnseenGarbageRouteStops and reconcile.ts.
 */
export const upsertGarbageRouteStops = async (
  records: GarbageRouteStopRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO garbage_route_stops
      (city, line_id, stop_rank, line_name, trip_label, team, district, village, stop_name,
       lat, lng, arrive_time, depart_time, garbage_days, recycling_days, foodscraps_days, memo,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      line_name = VALUES(line_name),
      trip_label = VALUES(trip_label),
      team = VALUES(team),
      district = VALUES(district),
      village = VALUES(village),
      stop_name = VALUES(stop_name),
      lat = VALUES(lat),
      lng = VALUES(lng),
      arrive_time = VALUES(arrive_time),
      depart_time = VALUES(depart_time),
      garbage_days = VALUES(garbage_days),
      recycling_days = VALUES(recycling_days),
      foodscraps_days = VALUES(foodscraps_days),
      memo = VALUES(memo),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.city,
      r.lineId,
      r.stopRank,
      r.lineName,
      r.tripLabel,
      r.team,
      r.district,
      r.village,
      r.stopName,
      r.lat,
      r.lng,
      r.arriveTime,
      r.departTime,
      r.garbageDays,
      r.recyclingDays,
      r.foodscrapsDays,
      r.memo,
      now,
      now,
      now,
    ],
  );
};

/** Row count currently stored for one city — the "previous snapshot size" the reconcile guard compares against. */
export const countGarbageRouteStops = async (city: GarbageRouteCity): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM garbage_route_stops WHERE city = ?`,
      [city],
    );
    return Number(rows[0]?.total ?? 0);
  });

/**
 * Removes one city's rows that the current run did not touch (synced_at older
 * than the run's start). Only ever called after decideSnapshotPrune approved
 * the fetch. Scoped to a single city so one city's outage can never delete the
 * other's rows. Returns the number of rows removed.
 */
export const pruneUnseenGarbageRouteStops = async (
  city: GarbageRouteCity,
  runStartedAtSql: string,
): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(
      `DELETE FROM garbage_route_stops
       WHERE city = ?
         AND synced_at < ?`,
      [city, runStartedAtSql],
    );
    return (result as { affectedRows: number }).affectedRows;
  });

export interface GarbageRouteStopRow {
  id: number;
  city: GarbageRouteCity;
  lineId: string;
  lineName: string;
  tripLabel: string | null;
  team: string | null;
  district: string;
  village: string | null;
  stopName: string;
  lat: number;
  lng: number;
  arriveTime: string | null;
  departTime: string | null;
  garbageDays: number | null;
  recyclingDays: number | null;
  foodscrapsDays: number | null;
  memo: string | null;
}

const nullableInt = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * One page of stops for a city, optionally narrowed to a district and/or a
 * keyword matched against the stop name, village and line name. Sorted by
 * district, line, trip and stop order so a route reads top to bottom.
 * Everything user-supplied is a bound parameter; the keyword's LIKE
 * wildcards are escaped.
 */
export const searchGarbageRouteStops = async (
  params: GarbageRouteSearchParams,
): Promise<{ total: number; stops: GarbageRouteStopRow[] }> =>
  withConnection(async (conn) => {
    const conditions = ["city = ?"];
    const values: unknown[] = [params.city];

    if (params.district) {
      conditions.push("district = ?");
      values.push(params.district);
    }
    if (params.keyword) {
      const pattern = `%${escapeLike(params.keyword)}%`;
      conditions.push("(stop_name LIKE ? ESCAPE '!' OR village LIKE ? ESCAPE '!' OR line_name LIKE ? ESCAPE '!')");
      values.push(pattern, pattern, pattern);
    }
    const where = conditions.join(" AND ");

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM garbage_route_stops WHERE ${where}`,
      values,
    );
    const total = Number(countRows[0]?.total ?? 0);
    if (total === 0 || params.offset >= total) return { total, stops: [] };

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, city, line_id, line_name, trip_label, team, district, village, stop_name,
              lat, lng, arrive_time, depart_time, garbage_days, recycling_days, foodscraps_days, memo
       FROM garbage_route_stops
       WHERE ${where}
       ORDER BY district, line_name, trip_label, line_id, stop_rank
       LIMIT ? OFFSET ?`,
      [...values, params.limit, params.offset],
    );

    return {
      total,
      stops: rows.map((r) => ({
        id: Number(r.id),
        city: r.city,
        lineId: r.line_id,
        lineName: r.line_name,
        tripLabel: r.trip_label ?? null,
        team: r.team ?? null,
        district: r.district,
        village: r.village ?? null,
        stopName: r.stop_name,
        lat: Number(r.lat),
        lng: Number(r.lng),
        arriveTime: r.arrive_time ?? null,
        departTime: r.depart_time ?? null,
        garbageDays: nullableInt(r.garbage_days),
        recyclingDays: nullableInt(r.recycling_days),
        foodscrapsDays: nullableInt(r.foodscraps_days),
        memo: r.memo ?? null,
      })),
    };
  });

export interface GarbageRouteCityMeta {
  districts: string[];
  /** Most recent successful sync of this city, ISO 8601; null before the first sync. */
  syncedAt: string | null;
  /** Rows stored for the city (unfiltered). */
  stopCount: number;
}

/**
 * Districts that have stops, plus freshness, for one city. Changes at most
 * once a day (the sync), so it is memoized instead of hitting MySQL on every
 * page view.
 */
export const getGarbageRouteCityMeta = async (city: GarbageRouteCity): Promise<GarbageRouteCityMeta> =>
  memoizeQuery(
    `garbage_route_meta_${city}`,
    () =>
      withConnection(async (conn) => {
        const [districtRows] = await conn.query<RowDataPacket[]>(
          `SELECT DISTINCT district FROM garbage_route_stops WHERE city = ? ORDER BY district`,
          [city],
        );
        const [statRows] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS total, MAX(synced_at) AS synced_at FROM garbage_route_stops WHERE city = ?`,
          [city],
        );
        const syncedAt = statRows[0]?.synced_at ? new Date(statRows[0].synced_at).toISOString() : null;
        return {
          districts: districtRows.map((r) => String(r.district)),
          syncedAt,
          stopCount: Number(statRows[0]?.total ?? 0),
        };
      }),
    300,
  );
