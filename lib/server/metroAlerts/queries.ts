import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { MetroAlertItem } from "./types";
import { readSeedJson } from "@/lib/server/db/seedReader";

function getSeedAlerts(): MetroAlertItem[] {
  return readSeedJson<MetroAlertItem[]>("metro-alerts-seed.json") || [];
}

export async function getMetroAlerts(options?: {
  lineName?: string;
  stationName?: string;
  alertType?: string;
  limit?: number;
}): Promise<MetroAlertItem[]> {
  const fallback = getSeedAlerts().filter((a) => {
    if (options?.lineName && !a.lineName.includes(options.lineName)) return false;
    if (options?.stationName && !a.stationName.includes(options.stationName)) return false;
    if (options?.alertType && a.alertType !== options.alertType) return false;
    return true;
  });

  return withConnectionFallback(fallback, async (conn) => {
    const conditions: string[] = ["status = 'active'"];
    const params: any[] = [];

    if (options?.lineName) {
      conditions.push("line_name LIKE ?");
      params.push(`%${options.lineName}%`);
    }
    if (options?.stationName) {
      conditions.push("station_name LIKE ?");
      params.push(`%${options.stationName}%`);
    }
    if (options?.alertType) {
      conditions.push("alert_type = ?");
      params.push(options.alertType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options?.limit ?? 100, 200);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT
        id,
        external_id AS externalId,
        line_name AS lineName,
        station_name AS stationName,
        alert_title AS alertTitle,
        alert_content AS alertContent,
        alert_type AS alertType,
        DATE_FORMAT(alert_time, '%Y-%m-%d %H:%i:%s') AS alertTime,
        status
      FROM metro_alerts
      ${whereClause}
      ORDER BY alert_time DESC
      LIMIT ?`,
      [...params, limit]
    );

    return rows as MetroAlertItem[];
  });
}
