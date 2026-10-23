import { extractSystemFromTopic, getRailSystemLabel } from "./topics.ts";
import { parseAndNormalizeMetroAlert, type NormalizedMetroAlert } from "./metroAlertParser.ts";
import { resolveStationMetadata, type ResolvedStationInfo } from "./stationResolver.ts";

export interface MetroAlertHandlerResult {
  ok: boolean;
  count: number;
  alertIds: string[];
  error?: string;
}

/**
 * Handles incoming MQTT Metro alert messages.
 * Parses raw JSON, enriches station dimensions, and performs idempotent upsert into DB.
 * Consumes 0 TDX REST API quota.
 */
export async function handleMetroAlertMessage(
  topic: string,
  payload: Buffer | string,
  deps: {
    upsertFn?: (alerts: NormalizedMetroAlert[]) => Promise<number>;
    resolveStationFn?: (system: string, id: string, name?: string) => Promise<ResolvedStationInfo>;
  } = {},
): Promise<MetroAlertHandlerResult> {
  const fallbackSystem = extractSystemFromTopic(topic);
  const alerts = parseAndNormalizeMetroAlert(payload, fallbackSystem);

  if (alerts.length === 0) {
    return { ok: true, count: 0, alertIds: [] };
  }

  // Enrich station dimensions
  for (const alert of alerts) {
    if (alert.stationId && alert.stationId !== "ALL") {
      const enriched = await resolveStationMetadata(
        alert.railSystem,
        alert.stationId,
        alert.stationName,
        { lookupFn: deps.resolveStationFn },
      );
      if (enriched.stationName) {
        alert.stationName = enriched.stationName;
      }
    }
  }

  const alertIds = alerts.map((a) => a.alertId);

  // If a mock or custom upsert function was injected (e.g. for unit testing)
  if (deps.upsertFn) {
    const count = await deps.upsertFn(alerts);
    return { ok: true, count, alertIds };
  }

  try {
    const { getPool } = await import("../../db/mysql.ts");
    const pool = getPool();
    if (!pool) {
      return { ok: false, count: 0, alertIds, error: "Database pool unavailable" };
    }

    let upserted = 0;
    for (const a of alerts) {
      const facilityName = a.lineName ? `${a.lineName} · 營運通報` : `${a.systemLabel} · 營運通報`;

      await pool.query(
        `INSERT INTO accessible_transit_facility_alerts
          (alert_id, rail_system, station_id, station_name, facility_id, facility_name,
           reason, description, start_time, end_time, publish_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           station_name = VALUES(station_name),
           facility_name = VALUES(facility_name),
           reason = VALUES(reason),
           description = VALUES(description),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           publish_time = VALUES(publish_time),
           updated_at = NOW()`,
        [
          a.alertId,
          a.railSystem,
          a.stationId,
          a.stationName,
          a.lineId || null,
          facilityName,
          a.reason,
          a.description,
          a.startTime,
          a.endTime,
          a.publishTime,
        ],
      );
      upserted += 1;
    }

    return { ok: true, count: upserted, alertIds };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, count: 0, alertIds, error: msg };
  }
}
