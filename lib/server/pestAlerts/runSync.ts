import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getPool } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import type { PestAlertItem } from "./types";

const SOURCE_URL =
  "https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=4KDR5HtfkTBp";

function parseDate(rawStr?: string | null): string {
  if (!rawStr) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = rawStr.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export interface PestSyncSummary {
  ok: boolean;
  totalUpserted: number;
  error: string | null;
}

export async function runPestAlertsSync(): Promise<PestSyncSummary> {
  const summary: PestSyncSummary = {
    ok: true,
    totalUpserted: 0,
    error: null,
  };

  const records: PestAlertItem[] = [];

  try {
    const res = await httpGetJson<unknown[]>(SOURCE_URL, { timeoutMs: 15000 });
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new Error(`Pest alerts API returned status ${res.status}`);
    }

    for (const item of res.data as Record<string, unknown>[]) {
      let parsedData: unknown[] = [];
      const crops = new Set<string>();
      let highestLevel = "綠燈";

      try {
        if (typeof item.AlertData === "string") {
          parsedData = JSON.parse(item.AlertData);
        } else if (Array.isArray(item.AlertData)) {
          parsedData = item.AlertData;
        }
      } catch {
        parsedData = [];
      }

      if (Array.isArray(parsedData)) {
        for (const p of parsedData as Record<string, unknown>[]) {
          const wl = p.WarningLevel as string | undefined;
          if (wl) {
            if (wl.includes("紅")) highestLevel = "紅燈";
            else if (wl.includes("黃") && highestLevel !== "紅燈") highestLevel = "黃燈";
          }
          if (Array.isArray(p.SurveyRecord)) {
            for (const s of p.SurveyRecord as Record<string, unknown>[]) {
              if (s.CropName) crops.add(String(s.CropName));
            }
          }
        }
      }

      records.push({
        subjectName: (item.SubjectName as string) || "農作物病蟲害",
        monitorType: (item.MonitorType as string) || "即時示警",
        alertTime: parseDate(item.AlertTime as string),
        targetCrops: [...crops].join("、") || "一般農作物",
        warningLevel: highestLevel,
        alertDataJson: JSON.stringify(parsedData),
        status: "active",
      });
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
        let inserted = 0;
        for (const r of records) {
          // Check if record exists for same subject_name and alert_time
          const [existing] = await pool.query<RowDataPacket[]>(
            "SELECT id FROM pest_alerts WHERE subject_name = ? AND alert_time = ? LIMIT 1",
            [r.subjectName, r.alertTime]
          );

          if (existing.length === 0) {
            await pool.query(
              `INSERT INTO pest_alerts (
                subject_name, monitor_type, alert_time, target_crops,
                alert_data_json, status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                r.subjectName,
                r.monitorType,
                r.alertTime,
                r.targetCrops,
                r.alertDataJson,
                r.status,
              ]
            );
            inserted++;
          }
        }
        summary.totalUpserted = inserted;
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      summary.error = `MySQL insert error: ${msg}`;
      summary.ok = false;
    }
  }

  return summary;
}
