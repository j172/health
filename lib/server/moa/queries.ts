import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { DEBRIS_FLOW_SEED } from "./data/debrisFlowSeed";
import type { DebrisFlowAlertItem, DebrisFlowOverview } from "./types";

interface DbDebrisRow extends RowDataPacket {
  id: number;
  debris_id: string;
  stream_code: string;
  stream_name: string;
  county: string;
  township: string;
  village: string | null;
  alert_level: string;
  rainfall_threshold_mm: number | string | null;
  advisory: string | null;
  lat: number | string;
  lng: number | string;
  issued_at: Date | string;
}

export async function ensureDebrisFlowSeeded(): Promise<void> {
  try {
    await withConnection(async (conn) => {
      const [countResult] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) as cnt FROM moa_debris_flow_alerts"
      );
      if ((countResult[0]?.cnt || 0) === 0) {
        for (const item of DEBRIS_FLOW_SEED) {
          await conn.execute(
            `INSERT INTO moa_debris_flow_alerts
             (debris_id, stream_code, stream_name, county, township, village, alert_level, rainfall_threshold_mm, advisory, lat, lng, issued_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               alert_level = VALUES(alert_level),
               advisory = VALUES(advisory),
               updated_at = NOW()`,
            [
              item.debrisId,
              item.streamCode,
              item.streamName,
              item.county,
              item.township,
              item.village || null,
              item.alertLevel,
              item.rainfallThresholdMm || null,
              item.advisory,
              item.lat,
              item.lng,
              new Date(item.issuedAt),
            ]
          );
        }
      }
    });
  } catch (err) {
    console.warn("Debris flow alerts seeding fallback to memory:", err instanceof Error ? err.message : String(err));
  }
}

export async function getDebrisFlowOverview(filter?: {
  county?: string;
  level?: "yellow" | "red";
}): Promise<DebrisFlowOverview> {
  await ensureDebrisFlowSeeded();

  try {
    return await withConnection(async (conn) => {
      let sql = "SELECT * FROM moa_debris_flow_alerts WHERE 1=1";
      const params: any[] = [];

      if (filter?.county && filter.county !== "all") {
        sql += " AND county = ?";
        params.push(filter.county);
      }
      if (filter?.level) {
        sql += " AND alert_level = ?";
        params.push(filter.level);
      }
      sql += " ORDER BY alert_level DESC, stream_code ASC";

      const [rows] = await conn.query<DbDebrisRow[]>(sql, params);

      if (rows.length === 0) {
        return getMemorySeedDebrisOverview(filter?.county, filter?.level);
      }

      const alerts: DebrisFlowAlertItem[] = rows.map((r) => ({
        debrisId: r.debris_id,
        streamCode: r.stream_code,
        streamName: r.stream_name,
        county: r.county,
        township: r.township,
        village: r.village || undefined,
        alertLevel: (r.alert_level as "yellow" | "red") || "yellow",
        rainfallThresholdMm: r.rainfall_threshold_mm
          ? Number(r.rainfall_threshold_mm)
          : undefined,
        advisory: r.advisory || "",
        lat: Number(r.lat) || 0,
        lng: Number(r.lng) || 0,
        issuedAt:
          r.issued_at instanceof Date
            ? r.issued_at.toISOString()
            : String(r.issued_at),
      }));

      const redCount = alerts.filter((a) => a.alertLevel === "red").length;
      const yellowCount = alerts.filter((a) => a.alertLevel === "yellow").length;
      const counties = Array.from(new Set(DEBRIS_FLOW_SEED.map((a) => a.county)));
      const countiesAffected = new Set(alerts.map((a) => a.county)).size;

      return {
        alerts,
        summary: {
          totalAlerts: alerts.length,
          redCount,
          yellowCount,
          countiesAffected,
        },
        counties,
        updatedAt: new Date().toISOString(),
      };
    });
  } catch {
    return getMemorySeedDebrisOverview(filter?.county, filter?.level);
  }
}

function getMemorySeedDebrisOverview(
  countyFilter?: string,
  levelFilter?: "yellow" | "red"
): DebrisFlowOverview {
  let list = DEBRIS_FLOW_SEED;

  if (countyFilter && countyFilter !== "all") {
    list = list.filter((a) => a.county === countyFilter);
  }
  if (levelFilter) {
    list = list.filter((a) => a.alertLevel === levelFilter);
  }

  const redCount = list.filter((a) => a.alertLevel === "red").length;
  const yellowCount = list.filter((a) => a.alertLevel === "yellow").length;
  const counties = Array.from(new Set(DEBRIS_FLOW_SEED.map((a) => a.county)));

  return {
    alerts: list,
    summary: {
      totalAlerts: list.length,
      redCount,
      yellowCount,
      countiesAffected: new Set(list.map((a) => a.county)).size,
    },
    counties,
    updatedAt: new Date().toISOString(),
  };
}
