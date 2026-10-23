import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { cacheInit } from "@/lib/server/http/cacheControl";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const railSystem = searchParams.get("railSystem")?.toUpperCase();
  const showAll = searchParams.get("all") === "true";

  try {
    const alerts = await withConnection(async (conn) => {
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
      return rows;
    });

    return NextResponse.json(
      {
        ok: true,
        alerts: alerts || [],
        total: alerts?.length || 0,
        updatedAt: new Date().toISOString(),
      },
      cacheInit("short"),
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to query transit alerts";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
