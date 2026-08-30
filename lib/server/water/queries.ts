import { withConnection } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { runWaterOutagesSync } from "./ingestWaterOutages";

export interface WaterOutageItem {
  id: string;
  publishTime: string;
  startTime: string;
  endTime: string;
  type: string;
  county: string;
  districts: string;
  reason: string;
  influenceArea: string;
  supplyStation: string;
  isWithinOneWeek: boolean;
}

let isSeeding = false;

async function checkAndAutoSeedWater(): Promise<void> {
  if (isSeeding) return;
  try {
    const rows = await withConnection(async (conn) => {
      const [r] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM water_outages"
      );
      return r;
    });
    if ((rows[0]?.cnt ?? 0) === 0) {
      isSeeding = true;
      runWaterOutagesSync()
        .then((res) => console.log("[Water Queries] Auto-seed complete:", res))
        .catch((err) => console.error("[Water Queries] Auto-seed error:", err))
        .finally(() => {
          isSeeding = false;
        });
    }
  } catch (err) {
    console.warn("[Water Queries] Auto-seed check error:", err);
  }
}

export async function getWaterOutages(limit = 50): Promise<{
  outages: WaterOutageItem[];
  totalCount: number;
  updatedAt: string;
}> {
  checkAndAutoSeedWater();

  return await withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, publish_time, start_time, end_time, outage_type, county,
              districts, reason, influence_area, supply_station, is_within_one_week
       FROM water_outages
       WHERE is_within_one_week = 1
       ORDER BY COALESCE(start_time, created_at) DESC
       LIMIT ?`,
      [limit]
    );

    const outages: WaterOutageItem[] = rows.map((r) => ({
      id: r.id,
      publishTime: r.publish_time || "",
      startTime: r.start_time ? new Date(r.start_time).toISOString().slice(0, 19).replace("T", " ") : "",
      endTime: r.end_time ? new Date(r.end_time).toISOString().slice(0, 19).replace("T", " ") : "",
      type: r.outage_type,
      county: r.county,
      districts: r.districts || "",
      reason: r.reason || "",
      influenceArea: r.influence_area || "",
      supplyStation: r.supply_station || "",
      isWithinOneWeek: Boolean(r.is_within_one_week),
    }));

    return {
      outages,
      totalCount: outages.length,
      updatedAt: new Date().toISOString(),
    };
  });
}

