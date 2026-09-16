import "server-only";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { fetchLiveEmergencyRooms } from "./fetchEmergencyData";
import type { EmergencyRoomItem } from "./types";

export interface EmergencySyncSummary {
  ok: boolean;
  totalUpserted: number;
  criticalCount: number;
  busyCount: number;
  normalCount: number;
  fullReportedCount: number;
  purgedOldLogs: number;
  error?: string | null;
}

export async function runEmergencyRoomSync(): Promise<EmergencySyncSummary> {
  const summary: EmergencySyncSummary = {
    ok: true,
    totalUpserted: 0,
    criticalCount: 0,
    busyCount: 0,
    normalCount: 0,
    fullReportedCount: 0,
    purgedOldLogs: 0,
    error: null,
  };

  try {
    const items = await fetchLiveEmergencyRooms();
    if (items.length === 0) return summary;

    for (const item of items) {
      if (item.congestion_level === "critical") summary.criticalCount++;
      else if (item.congestion_level === "busy") summary.busyCount++;
      else summary.normalCount++;
      if (item.is_full_reported) summary.fullReportedCount++;
    }

    const nowSql = utcNowSql();

    // 1. 批次更新最新快照表 emergency_room_status
    await withConnection(async (conn) => {
      const statusRows = items.map((item) => [
        item.hospital_code,
        item.hospital_name,
        item.city_code,
        item.city_name,
        item.area_name || null,
        item.address || null,
        item.phone || null,
        item.lat || null,
        item.lng || null,
        item.hospital_level,
        item.waiting_consultation,
        item.waiting_bed,
        item.waiting_admission,
        item.waiting_icu,
        item.is_full_reported ? 1 : 0,
        item.full_reported_note || null,
        item.congestion_level,
        item.reported_at,
        nowSql,
        nowSql,
      ]);

      await conn.query(
        `
        INSERT INTO emergency_room_status
          (hospital_code, hospital_name, city_code, city_name, area_name, address, phone, lat, lng,
           hospital_level, waiting_consultation, waiting_bed, waiting_admission, waiting_icu,
           is_full_reported, full_reported_note, congestion_level, reported_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          hospital_name = VALUES(hospital_name),
          city_code = VALUES(city_code),
          city_name = VALUES(city_name),
          area_name = VALUES(area_name),
          address = VALUES(address),
          phone = VALUES(phone),
          lat = VALUES(lat),
          lng = VALUES(lng),
          hospital_level = VALUES(hospital_level),
          waiting_consultation = VALUES(waiting_consultation),
          waiting_bed = VALUES(waiting_bed),
          waiting_admission = VALUES(waiting_admission),
          waiting_icu = VALUES(waiting_icu),
          is_full_reported = VALUES(is_full_reported),
          full_reported_note = VALUES(full_reported_note),
          congestion_level = VALUES(congestion_level),
          reported_at = VALUES(reported_at),
          updated_at = VALUES(updated_at)
        `,
        [statusRows]
      );

      // 2. 寫入時序紀錄表 emergency_room_logs (供 24 小時走勢圖分析)
      const logRows = items.map((item) => [
        item.hospital_code,
        item.waiting_consultation,
        item.waiting_bed,
        item.waiting_admission,
        item.waiting_icu,
        item.is_full_reported ? 1 : 0,
        item.congestion_level,
        item.reported_at,
        nowSql,
      ]);

      await conn.query(
        `
        INSERT INTO emergency_room_logs
          (hospital_code, waiting_consultation, waiting_bed, waiting_admission, waiting_icu,
           is_full_reported, congestion_level, reported_at, created_at)
        VALUES ?
        `,
        [logRows]
      );

      // 3. 自動清除 24 小時前之過期歷史資料，防止資料表膨脹
      const [purgeRes] = await conn.query(
        "DELETE FROM emergency_room_logs WHERE reported_at < NOW() - INTERVAL 24 HOUR"
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      summary.purgedOldLogs = (purgeRes as any)?.affectedRows || 0;
      summary.totalUpserted = items.length;
    });

    return summary;
  } catch (err) {
    console.error("EmergencyRoomSync failed:", err);
    summary.ok = false;
    summary.error = err instanceof Error ? err.message : String(err);
    return summary;
  }
}
