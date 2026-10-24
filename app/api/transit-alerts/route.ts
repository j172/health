import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { tdxStreamCircuitBreaker } from "@/lib/server/tdx/mqtt/circuitBreaker";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const railSystem = searchParams.get("railSystem")?.toUpperCase();
  const showAll = searchParams.get("all") === "true";

  try {
    const result = await withConnection(async (conn) => {
      let sql = `
        SELECT
          t.alert_id AS alertId,
          t.rail_system AS railSystem,
          t.station_id AS stationId,
          t.station_name AS stationName,
          t.facility_id AS facilityId,
          t.facility_name AS facilityName,
          t.reason AS reason,
          t.description AS description,
          t.start_time AS startTime,
          t.end_time AS endTime,
          t.publish_time AS publishTime,
          t.updated_at AS updatedAt,
          f.county AS county
        FROM accessible_transit_facility_alerts t
        LEFT JOIN accessible_transit_facilities f ON f.station_id = t.station_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (!showAll) {
        sql += ` AND (t.start_time IS NULL OR t.start_time <= NOW())
                 AND (t.end_time IS NULL OR t.end_time >= NOW())`;
      }

      if (railSystem && railSystem !== "ALL") {
        sql += ` AND t.rail_system = ?`;
        params.push(railSystem);
      }

      sql += ` ORDER BY t.start_time DESC, t.updated_at DESC LIMIT 50`;

      const [rows] = await conn.query<RowDataPacket[]>(sql, params);

      // Query reconciliation syncMeta from provider_api_cache
      const [cacheRows] = await conn.query<RowDataPacket[]>(
        `SELECT response_json, fetched_at_utc
         FROM provider_api_cache
         WHERE cache_key = 'tdx:metro-alerts:reconciliation'
         LIMIT 1`,
      );

      let lastReconciledAt: string | null = null;
      if (cacheRows && cacheRows.length > 0) {
        try {
          const parsed = JSON.parse(cacheRows[0].response_json);
          lastReconciledAt = parsed.reconciledAt || cacheRows[0].fetched_at_utc || null;
        } catch {
          lastReconciledAt = cacheRows[0].fetched_at_utc || null;
        }
      }

      // Default pushMode: "mqtt_live" when circuit is CLOSED, "rest_fallback" when OPEN
      const circuitStatus = tdxStreamCircuitBreaker.getCircuitStatus();
      const pushMode = circuitStatus.state === "CLOSED" ? "mqtt_live" : "rest_fallback";

      return {
        alerts: rows,
        syncMeta: {
          pushMode,
          circuitState: circuitStatus.state,
          activeEngine: circuitStatus.activeEngine,
          lastReconciledAt,
        },
      };
    });

    return NextResponse.json(
      {
        ok: true,
        alerts: result.alerts || [],
        total: result.alerts?.length || 0,
        syncMeta: result.syncMeta,
        updatedAt: new Date().toISOString(),
      },
      cacheInit("short"),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query transit alerts";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
