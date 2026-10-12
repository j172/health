import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { MetroAlertItem } from "./types";
import { readSeedJson } from "@/lib/server/db/seedReader";

function getSeedAlerts(): MetroAlertItem[] {
  const seeds = readSeedJson<MetroAlertItem[]>("metro-alerts-seed.json") || [];
  // Pre-#470 seed rows (and any hand-edited ones) may lack systemCode/
  // systemLabel — default to TRTC/臺北捷運 so the UI's per-system filter
  // never has to special-case "missing" as a 9th bucket.
  return seeds.map((s) => ({
    systemCode: s.systemCode || "TRTC",
    systemLabel: s.systemLabel || "臺北捷運",
    ...s,
  }));
}

export async function getMetroAlerts(options?: {
  lineName?: string;
  stationName?: string;
  alertType?: string;
  systemCode?: string;
  limit?: number;
}): Promise<MetroAlertItem[]> {
  const fallback = getSeedAlerts().filter((a) => {
    if (options?.lineName && !a.lineName.includes(options.lineName)) return false;
    if (options?.stationName && !a.stationName.includes(options.stationName)) return false;
    if (options?.alertType && a.alertType !== options.alertType) return false;
    if (options?.systemCode && a.systemCode !== options.systemCode) return false;
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
    if (options?.systemCode) {
      conditions.push("system_code = ?");
      params.push(options.systemCode);
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
        status,
        system_code AS systemCode,
        system_label AS systemLabel
      FROM metro_alerts
      ${whereClause}
      ORDER BY alert_time DESC
      LIMIT ?`,
      [...params, limit]
    );

    return rows as MetroAlertItem[];
  });
}

/**
 * Lightweight count of currently-active alerts across every rail system —
 * used by the "颱風地震來了" guide hub (issue #470 acceptance criterion 3)
 * to show "目前有無通阻" inline on that step, without pulling full alert
 * rows just to get a count.
 */
export async function getActiveMetroAlertsCount(): Promise<number> {
  const fallbackCount = getSeedAlerts().filter((a) => a.status === "active").length;

  return withConnectionFallback(fallbackCount, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM metro_alerts WHERE status = 'active'`,
    );
    return Number((rows as RowDataPacket[])[0]?.cnt ?? 0);
  });
}
