import "server-only";
import crypto from "node:crypto";
import { httpRequest } from "@/lib/server/net/httpClient";
import { getPool } from "@/lib/server/db/mysql";
import type { MetroAlertItem } from "./types";
import { RAIL_ALERT_SOURCES, fetchAllRailAlerts } from "./tdxClient";

const TAIPEI_CSV_SOURCE_URL =
  "https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=649c44eb-60b5-4746-a353-cbdc6651fc09";

function parseCsvDate(rawStr?: string | null): string {
  if (!rawStr) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = rawStr.trim().replace("T", "");
  if (clean.length >= 14) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(8, 10);
    const min = clean.slice(10, 12);
    const s = clean.slice(12, 14);
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Taipei Metro's own Big5 CSV feed (the tool's sole source before issue
 * #470). Kept as a fallback for TRTC specifically — not retired outright,
 * per docs/2.0/spec-issue-438.md §P T4's "退役（或作為備援，實作時依資料完整
 * 度決定）" — only invoked from runMetroAlertsSync() when the TDX
 * Metro/Alert call for TRTC itself fails, never when it succeeds with zero
 * rows (which legitimately means "目前無通阻", not a failure). Distinct from
 * the other 7 TDX-sourced systems, this CSV also reports elevator-specific
 * maintenance notices ("elevator" alertType), which TDX's Metro/Alert
 * endpoint has no equivalent for.
 */
export async function fetchTaipeiCsvAlerts(): Promise<MetroAlertItem[]> {
  const res = await httpRequest(TAIPEI_CSV_SOURCE_URL, { timeoutMs: 15000 });
  if (res.status !== 200) {
    throw new Error(`Taipei Metro CSV returned status ${res.status}`);
  }

  const text = new TextDecoder("big5").decode(res.buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];

  const records: MetroAlertItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        parts.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    parts.push(current.trim());

    if (parts.length >= 5) {
      const [, dt, lineName, stationName, desc] = parts;
      const formattedTime = parseCsvDate(dt);
      const extId = crypto
        .createHash("md5")
        .update(`${dt}_${lineName}_${stationName}_${desc}`)
        .digest("hex")
        .slice(0, 32);

      const alertType = desc.includes("電梯") ? "elevator" : "operational";
      const title = desc.includes("電梯")
        ? `${stationName} 電梯檢修暫停使用公告`
        : `${lineName} ${stationName} 營運資訊公告`;

      records.push({
        externalId: `TRTC_CSV_${extId}`,
        lineName: lineName.replace(/捷運/g, "").trim(),
        stationName: stationName.trim(),
        alertTitle: title,
        alertContent: desc.trim(),
        alertType,
        alertTime: formattedTime,
        status: "active",
        systemCode: "TRTC",
        systemLabel: "臺北捷運",
      });
    }
  }

  return records;
}

export interface MetroSyncSummary {
  ok: boolean;
  totalUpserted: number;
  error: string | null;
  bySystem: Record<string, number>;
  errors: Record<string, string>;
}

async function upsertAlerts(records: MetroAlertItem[]): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const BATCH_SIZE = 100;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const values = chunk.map((r) => [
      r.externalId,
      r.lineName,
      r.stationName,
      r.alertTitle,
      r.alertContent,
      r.alertType,
      r.alertTime,
      r.status,
      r.systemCode || "TRTC",
      r.systemLabel || "臺北捷運",
      new Date(),
      new Date(),
    ]);

    await pool.query(
      `INSERT INTO metro_alerts (
        external_id, line_name, station_name, alert_title,
        alert_content, alert_type, alert_time, status,
        system_code, system_label, created_at, updated_at
      ) VALUES ?
      ON DUPLICATE KEY UPDATE
        alert_title = VALUES(alert_title),
        alert_content = VALUES(alert_content),
        alert_type = VALUES(alert_type),
        alert_time = VALUES(alert_time),
        status = VALUES(status),
        system_code = VALUES(system_code),
        system_label = VALUES(system_label),
        updated_at = NOW()`,
      [values],
    );
  }
}

/**
 * Marks any previously-active row for `systemCode` that didn't appear in
 * this round's fresh `externalId`s as resolved. Without this, a disruption
 * that clears upstream would sit in `metro_alerts` as `status='active'`
 * forever — this table's status was never flipped anywhere else — which
 * would permanently pollute "目前有無通阻" for that system (issue #470
 * acceptance criterion 3's live-status visibility depends on this being
 * accurate, not just "ever seen once"). Only called for systems that
 * successfully fetched this round; a failed system's existing rows are left
 * untouched by the caller.
 */
async function resolveStaleAlerts(systemCode: string, freshExternalIds: string[]): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  try {
    if (freshExternalIds.length === 0) {
      await pool.query(
        `UPDATE metro_alerts SET status = 'resolved', updated_at = NOW()
         WHERE system_code = ? AND status = 'active'`,
        [systemCode],
      );
    } else {
      await pool.query(
        `UPDATE metro_alerts SET status = 'resolved', updated_at = NOW()
         WHERE system_code = ? AND status = 'active' AND external_id NOT IN (?)`,
        [systemCode, freshExternalIds],
      );
    }
  } catch {
    // Best-effort cleanup — a failed UPDATE here must never fail the sync
    // run or affect any other system's rows.
  }
}

/**
 * Syncs all 8 rail alert sources (issue #470): fans out to TDX via
 * fetchAllRailAlerts() (already per-system Promise.allSettled-isolated),
 * falls back to Taipei's own CSV only for TRTC when TDX's TRTC call itself
 * failed, upserts every successfully-fetched system's alerts, and resolves
 * stale rows per successfully-fetched system. A system whose fetch failed
 * this round keeps its last-known rows untouched (neither upserted nor
 * resolved) rather than guessing — isolating its failure from the other 7
 * systems' display, per acceptance criterion 4.
 */
export async function runMetroAlertsSync(): Promise<MetroSyncSummary> {
  const summary: MetroSyncSummary = {
    ok: true,
    totalUpserted: 0,
    error: null,
    bySystem: {},
    errors: {},
  };

  const { alerts, bySystem, errors } = await fetchAllRailAlerts();
  summary.bySystem = { ...bySystem };
  summary.errors = { ...errors };

  const records: MetroAlertItem[] = [...alerts];

  let trtcCsvFallbackSucceeded = false;
  if (errors.TRTC) {
    try {
      const csvRecords = await fetchTaipeiCsvAlerts();
      records.push(...csvRecords);
      summary.bySystem.TRTC = csvRecords.length;
      summary.errors.TRTC = `${errors.TRTC} (降級為臺北捷運 data.taipei CSV 備援)`;
      trtcCsvFallbackSucceeded = true;
    } catch (csvErr) {
      const msg = csvErr instanceof Error ? csvErr.message : String(csvErr);
      summary.errors.TRTC = `${errors.TRTC}; CSV fallback also failed: ${msg}`;
    }
  }

  if (records.length === 0 && Object.keys(summary.errors).length >= RAIL_ALERT_SOURCES.length) {
    summary.ok = false;
    summary.error = "All rail alert sources failed this round";
    return summary;
  }

  try {
    await upsertAlerts(records);
    summary.totalUpserted = records.length;
  } catch (dbErr) {
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    summary.error = `MySQL upsert error: ${msg}`;
    summary.ok = false;
    return summary;
  }

  // Resolve stale rows per successfully-fetched system only (CSV fallback
  // counts as "successfully fetched" for TRTC, since it produced fresh data
  // this round — only a system with NO fresh data at all, TDX and CSV both
  // failed, is skipped here).
  for (const source of RAIL_ALERT_SOURCES) {
    const tdxFailed = Boolean(errors[source.code]);
    const isTrtcRecoveredByCsv = source.code === "TRTC" && trtcCsvFallbackSucceeded;
    if (tdxFailed && !isTrtcRecoveredByCsv) continue;

    const freshIds = records.filter((r) => r.systemCode === source.code).map((r) => r.externalId);
    await resolveStaleAlerts(source.code, freshIds);
  }

  return summary;
}
