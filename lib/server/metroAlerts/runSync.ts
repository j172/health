import "server-only";
import crypto from "node:crypto";
import { httpRequest } from "@/lib/server/net/httpClient";
import { getPool } from "@/lib/server/db/mysql";
import type { MetroAlertItem } from "./types";

const SOURCE_URL =
  "https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=649c44eb-60b5-4746-a353-cbdc6651fc09";

function parseDate(rawStr?: string | null): string {
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

export interface MetroSyncSummary {
  ok: boolean;
  totalUpserted: number;
  error: string | null;
}

export async function runMetroAlertsSync(): Promise<MetroSyncSummary> {
  const summary: MetroSyncSummary = {
    ok: true,
    totalUpserted: 0,
    error: null,
  };

  const records: MetroAlertItem[] = [];

  try {
    const res = await httpRequest(SOURCE_URL, { timeoutMs: 15000 });
    if (res.status !== 200) {
      throw new Error(`Metro CSV returned status ${res.status}`);
    }

    const text = new TextDecoder("big5").decode(res.buffer);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length <= 1) {
      return summary;
    }

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
        const formattedTime = parseDate(dt);
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
          externalId: extId,
          lineName: lineName.replace(/捷運/g, "").trim(),
          stationName: stationName.trim(),
          alertTitle: title,
          alertContent: desc.trim(),
          alertType,
          alertTime: formattedTime,
          status: "active",
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.error = msg;
    summary.ok = false;
    return summary;
  }

  if (records.length > 0) {
    try {
      const pool = getPool();
      if (pool) {
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
            new Date(),
            new Date(),
          ]);

          await pool.query(
            `INSERT INTO metro_alerts (
              external_id, line_name, station_name, alert_title,
              alert_content, alert_type, alert_time, status, created_at, updated_at
            ) VALUES ?
            ON DUPLICATE KEY UPDATE
              alert_title = VALUES(alert_title),
              alert_content = VALUES(alert_content),
              alert_type = VALUES(alert_type),
              alert_time = VALUES(alert_time),
              status = VALUES(status),
              updated_at = NOW()`,
            [values]
          );
        }
        summary.totalUpserted = records.length;
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      summary.error = `MySQL upsert error: ${msg}`;
      summary.ok = false;
    }
  }

  return summary;
}
