import fs from "node:fs";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import type { PestAlertItem } from "./types";

const SEED_PATH = path.join(process.cwd(), "data", "pest-alerts-seed.json");

function getSeedAlerts(): PestAlertItem[] {
  try {
    if (fs.existsSync(SEED_PATH)) {
      return JSON.parse(fs.readFileSync(SEED_PATH, "utf-8")) as PestAlertItem[];
    }
  } catch (err) {
    console.warn("Failed to read pest-alerts-seed.json:", err);
  }
  return [];
}

export async function getPestAlerts(options?: {
  keyword?: string;
  warningLevel?: string;
  limit?: number;
}): Promise<PestAlertItem[]> {
  const fallback = getSeedAlerts().filter((a) => {
    if (options?.keyword) {
      const kw = options.keyword.toLowerCase();
      const matchSub = a.subjectName.toLowerCase().includes(kw);
      const matchCrops = a.targetCrops.toLowerCase().includes(kw);
      if (!matchSub && !matchCrops) return false;
    }
    if (options?.warningLevel && a.warningLevel !== options.warningLevel) return false;
    return true;
  });

  return withConnectionFallback(fallback, async (conn) => {
    const conditions: string[] = ["status = 'active'"];
    const params: any[] = [];

    if (options?.keyword) {
      conditions.push("(subject_name LIKE ? OR target_crops LIKE ?)");
      params.push(`%${options.keyword}%`, `%${options.keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(options?.limit ?? 50, 100);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT
        id,
        subject_name AS subjectName,
        monitor_type AS monitorType,
        DATE_FORMAT(alert_time, '%Y-%m-%d %H:%i:%s') AS alertTime,
        target_crops AS targetCrops,
        alert_data_json AS alertDataJson,
        status
      FROM pest_alerts
      ${whereClause}
      ORDER BY alert_time DESC
      LIMIT ?`,
      [...params, limit]
    );

    return (rows as any[]).map((r) => {
      let highestLevel = "綠燈";
      try {
        const parsed = JSON.parse(r.alertDataJson || "[]");
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            if (p.WarningLevel?.includes("紅")) highestLevel = "紅燈";
            else if (p.WarningLevel?.includes("黃") && highestLevel !== "紅燈") highestLevel = "黃燈";
          }
        }
      } catch {}

      return {
        ...r,
        warningLevel: highestLevel,
      };
    });
  });
}
