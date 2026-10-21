import "server-only";
import { getPool } from "@/lib/server/db/mysql";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { RAIL_SYSTEMS, type RailSystem } from "./railSystems";
import { fetchSeniorFacilityAlert, type SeniorStationFacilityAlert } from "./tdxSeniorClient";

// issue #730：無障礙交通頁瘦身。每日軌道無障礙同步（設施／服務／導覽圖／轉乘）與每日公車
// 低地板比率同步已移除，這個檔案只剩每小時的電梯停用公告同步。設施、路線、熱線改以種子資料
// （及資料表內既有資料）為主，不再有排程更新它們。

export interface TransitAlertsSyncSummary {
  ok: boolean;
  alertsUpserted: number;
  errors: string[];
}

/** Best-effort date parser for TDX's ISO-ish timestamps — returns null (not
 * throwing) on anything unparseable so one bad row never aborts a batch. */
const toSqlDateTime = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * Facility/Alert sync — registered as its own hourly cron job (16 * * * *)
 * since TDX reports this endpoint's UpdateInterval as -1 (event-triggered).
 * It is the only TDX job left for the accessible-transit page.
 */
export async function runTransitFacilityAlertsSync(): Promise<TransitAlertsSyncSummary> {
  const summary: TransitAlertsSyncSummary = { ok: true, alertsUpserted: 0, errors: [] };

  const allAlerts: Array<{ system: RailSystem; alert: SeniorStationFacilityAlert }> = [];

  if (!(await getTdxToken())) {
    summary.ok = false;
    summary.errors.push("TDX credentials missing or token request failed — nothing was fetched");
    return summary;
  }

  // Sequential through the shared 5 req/min limiter — 10 requests per run,
  // roughly 2 minutes.
  for (const system of RAIL_SYSTEMS) {
    try {
      for (const alert of await fetchSeniorFacilityAlert(system)) allAlerts.push({ system, alert });
    } catch (err) {
      summary.errors.push(
        `${system} Facility/Alert fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  try {
    for (const { system, alert } of allAlerts) {
      if (!alert.AlertID || !alert.StationID) continue;
      await pool.query(
        `INSERT INTO accessible_transit_facility_alerts
          (alert_id, rail_system, station_id, station_name, facility_id, facility_name,
           reason, description, start_time, end_time, publish_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           station_name = VALUES(station_name),
           facility_id = VALUES(facility_id),
           facility_name = VALUES(facility_name),
           reason = VALUES(reason),
           description = VALUES(description),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           publish_time = VALUES(publish_time),
           updated_at = NOW()`,
        [
          alert.AlertID,
          system,
          alert.StationID,
          alert.StationName || alert.StationID,
          alert.FacilityID || null,
          alert.FacilityName || null,
          alert.Reason || null,
          alert.Description || null,
          toSqlDateTime(alert.StartTime),
          toSqlDateTime(alert.EndTime),
          toSqlDateTime(alert.PublishTime),
        ],
      );
      summary.alertsUpserted += 1;
    }
  } catch (err) {
    summary.errors.push(`alerts upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    summary.ok = false;
  }

  return summary;
}
