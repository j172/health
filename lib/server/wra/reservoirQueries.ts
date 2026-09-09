import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { ReservoirStatusRecord } from "@/lib/server/wra/fetchReservoirStatus";

import { ensureCatalogsSeeded } from "@/lib/server/wra/catalogQueries";

export interface ReservoirStatusListItem {
  reservoir_id: string;
  reservoir_name: string | null;
  river_name: string | null;
  town_name: string | null;
  area_code: string | null;
  observation_time: Date;
  water_level: number | null;
  effective_capacity: number | null;
  inflow_discharge: number | null;
  total_outflow: number | null;
  spillway_outflow: number | null;
  power_outlet_outflow: number | null;
  drainage_tunnel_outflow: number | null;
  desilting_tunnel_outflow: number | null;
  others_outflow: number | null;
  water_draw: number | null;
  accumulate_rainfall: number | null;
  predetermined_cross_flow: number | null;
  predetermined_outflow_time: string | null;
  status_type: string | null;
}

/** Upserts a batch of readings, keyed by (reservoir_id, observation_time) — re-syncing the same hour is a no-op update, not a duplicate row. */
export const upsertReservoirStatus = async (
  records: ReservoirStatusRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO wra_reservoir_status
      (reservoir_id, observation_time, water_level, effective_capacity, inflow_discharge, total_outflow,
       spillway_outflow, power_outlet_outflow, drainage_tunnel_outflow, desilting_tunnel_outflow, others_outflow,
       water_draw, accumulate_rainfall, predetermined_cross_flow, predetermined_outflow_time, status_type,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      water_level = VALUES(water_level),
      effective_capacity = VALUES(effective_capacity),
      inflow_discharge = VALUES(inflow_discharge),
      total_outflow = VALUES(total_outflow),
      spillway_outflow = VALUES(spillway_outflow),
      power_outlet_outflow = VALUES(power_outlet_outflow),
      drainage_tunnel_outflow = VALUES(drainage_tunnel_outflow),
      desilting_tunnel_outflow = VALUES(desilting_tunnel_outflow),
      others_outflow = VALUES(others_outflow),
      water_draw = VALUES(water_draw),
      accumulate_rainfall = VALUES(accumulate_rainfall),
      predetermined_cross_flow = VALUES(predetermined_cross_flow),
      predetermined_outflow_time = VALUES(predetermined_outflow_time),
      status_type = VALUES(status_type),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.reservoirId,
      r.observationTime,
      r.waterLevel,
      r.effectiveCapacity,
      r.inflowDischarge,
      r.totalOutflow,
      r.spillwayOutflow,
      r.powerOutletOutflow,
      r.drainageTunnelOutflow,
      r.desiltingTunnelOutflow,
      r.othersOutflow,
      r.waterDraw,
      r.accumulateRainfall,
      r.predeterminedCrossFlow,
      r.predeterminedOutflowTime,
      r.statusType,
      now,
      now,
      now,
    ],
  );

export interface ReservoirStatusPageParams {
  keyword?: string;
  region?: string;
  limit: number;
  offset: number;
}

/**
 * Latest reading per reservoir, joined with wra_reservoirs catalog for official
 * Chinese name, river, and town names. Supports keyword search across id/name/river/town
 * and region prefix filter (10: 北部, 20: 中部, 30: 南部, 40: 東部, 50: 離島).
 */
export const getLatestReservoirStatusPage = async ({
  keyword,
  region,
  limit,
  offset,
}: ReservoirStatusPageParams): Promise<{ rows: ReservoirStatusListItem[]; total: number }> => {
  // Ensure catalog table is populated on cold start
  await ensureCatalogsSeeded().catch(() => {});

  return withConnection(async (conn) => {
    const conditions: string[] = ["1 = 1"];
    const params: unknown[] = [];

    if (region) {
      conditions.push("latest.reservoir_id LIKE ?");
      params.push(`${region}%`);
    }

    if (keyword) {
      const kw = `%${keyword}%`;
      conditions.push(
        "(latest.reservoir_id LIKE ? OR c.reservoir_name LIKE ? OR c.river_name LIKE ? OR c.town_name LIKE ?)",
      );
      params.push(kw, kw, kw, kw);
    }

    const whereSql = conditions.join(" AND ");

    const [countRows] = await conn.query<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT reservoir_id, MAX(observation_time) AS max_observation_time
        FROM wra_reservoir_status
        GROUP BY reservoir_id
      ) latest
      LEFT JOIN wra_reservoirs c ON c.reservoir_id = latest.reservoir_id
      WHERE ${whereSql}
      `,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT r.reservoir_id, c.reservoir_name, c.river_name, c.town_name, c.area_code,
             r.observation_time, r.water_level, r.effective_capacity, r.inflow_discharge, r.total_outflow,
             r.spillway_outflow, r.power_outlet_outflow, r.drainage_tunnel_outflow, r.desilting_tunnel_outflow,
             r.others_outflow, r.water_draw, r.accumulate_rainfall, r.predetermined_cross_flow,
             r.predetermined_outflow_time, r.status_type
      FROM wra_reservoir_status r
      INNER JOIN (
        SELECT reservoir_id, MAX(observation_time) AS max_observation_time
        FROM wra_reservoir_status
        GROUP BY reservoir_id
      ) latest ON latest.reservoir_id = r.reservoir_id AND latest.max_observation_time = r.observation_time
      LEFT JOIN wra_reservoirs c ON c.reservoir_id = r.reservoir_id
      WHERE ${whereSql}
      ORDER BY r.reservoir_id ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return { total, rows: rows as unknown as ReservoirStatusListItem[] };
  });
};
