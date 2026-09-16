import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import type { EmergencyRoomItem, EmergencyOverviewResult, CongestionLevel } from "./types";
import { runEmergencyRoomSync } from "./runSync";

interface ErRow extends RowDataPacket {
  id: number;
  hospital_code: string;
  hospital_name: string;
  city_code: string;
  city_name: string;
  area_name: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  hospital_level: string;
  waiting_consultation: number;
  waiting_bed: number;
  waiting_admission: number;
  waiting_icu: number;
  is_full_reported: number;
  full_reported_note: string | null;
  congestion_level: string;
  reported_at: string;
  updated_at: string;
  distance_km?: number;
}

interface ErLogRow extends RowDataPacket {
  waiting_consultation: number;
  reported_at: string;
}

/**
 * 查詢急診即時總覽看板資料
 */
export async function getEmergencyRoomOverview(params?: {
  cityCode?: string;
  keyword?: string;
  onlyCritical?: boolean;
  onlyFullReported?: boolean;
  lat?: number;
  lng?: number;
  limit?: number;
}): Promise<EmergencyOverviewResult> {
  return await withConnection(async (conn) => {
    // 檢查是否有資料，若全空則自動觸發一次同步
    const [countCheck] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM emergency_room_status"
    );
    if ((countCheck[0]?.cnt || 0) === 0) {
      try {
        await runEmergencyRoomSync();
      } catch (err) {
        console.warn("Auto-sync emergency rooms failed:", err);
      }
    }

    const whereClauses: string[] = ["1=1"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];

    if (params?.cityCode) {
      whereClauses.push("city_code = ?");
      values.push(params.cityCode);
    }

    if (params?.keyword && params.keyword.trim()) {
      whereClauses.push("(hospital_name LIKE ? OR address LIKE ? OR area_name LIKE ?)");
      const kw = `%${params.keyword.trim()}%`;
      values.push(kw, kw, kw);
    }

    if (params?.onlyCritical) {
      whereClauses.push("congestion_level = 'critical'");
    }

    if (params?.onlyFullReported) {
      whereClauses.push("is_full_reported = 1");
    }

    let selectFields = `
      id, hospital_code, hospital_name, city_code, city_name, area_name, address, phone,
      lat, lng, hospital_level, waiting_consultation, waiting_bed, waiting_admission, waiting_icu,
      is_full_reported, full_reported_note, congestion_level, reported_at, updated_at
    `;

    let orderBy = "is_full_reported DESC, waiting_consultation DESC, hospital_level = '醫學中心' DESC";

    if (params?.lat !== undefined && params?.lng !== undefined && params.lat && params.lng) {
      selectFields += `,
        (6371 * acos(
          cos(radians(?)) * cos(radians(lat)) *
          cos(radians(lng) - radians(?)) +
          sin(radians(?)) * sin(radians(lat))
        )) AS distance_km
      `;
      values.unshift(params.lat, params.lng, params.lat);
      orderBy = "distance_km ASC";
    }

    const limit = Math.min(params?.limit || 100, 150);
    const sql = `
      SELECT ${selectFields}
      FROM emergency_room_status
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `;

    const [rows] = await conn.query<ErRow[]>(sql, values);

    // 統計全台壅塞概況
    const [statsRows] = await conn.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN congestion_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN congestion_level = 'busy' THEN 1 ELSE 0 END) as busy_count,
        SUM(CASE WHEN congestion_level = 'normal' THEN 1 ELSE 0 END) as normal_count,
        SUM(CASE WHEN is_full_reported = 1 THEN 1 ELSE 0 END) as full_count,
        MAX(reported_at) as latest_report
      FROM emergency_room_status
    `);

    const stats = statsRows[0] || {};

    // 取得前 25 家醫院的 24 小時走勢圖資料 (Sparkline)
    const topCodes = rows.slice(0, 25).map((r) => r.hospital_code);
    const sparklineMap = new Map<string, number[]>();

    if (topCodes.length > 0) {
      try {
        const [logRows] = await conn.query<ErLogRow[]>(
          `
          SELECT hospital_code, waiting_consultation, reported_at
          FROM emergency_room_logs
          WHERE hospital_code IN (?)
          ORDER BY reported_at ASC
          `,
          [topCodes]
        );

        for (const log of logRows) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const code = (log as any).hospital_code;
          if (!sparklineMap.has(code)) {
            sparklineMap.set(code, []);
          }
          sparklineMap.get(code)!.push(log.waiting_consultation);
        }
      } catch (err) {
        console.warn("Failed to query emergency_room_logs sparklines:", err);
      }
    }

    const items: EmergencyRoomItem[] = rows.map((r) => {
      const sparkline = sparklineMap.get(r.hospital_code) || [r.waiting_consultation];
      // 趨勢判定：取後半段與前半段均值比較
      let direction: "up" | "down" | "flat" = "flat";
      if (sparkline.length >= 4) {
        const half = Math.floor(sparkline.length / 2);
        const firstHalf = sparkline.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const secondHalf = sparkline.slice(half).reduce((a, b) => a + b, 0) / (sparkline.length - half);
        if (secondHalf - firstHalf >= 3) direction = "up";
        else if (firstHalf - secondHalf >= 3) direction = "down";
      }

      return {
        id: r.id,
        hospital_code: r.hospital_code,
        hospital_name: r.hospital_name,
        city_code: r.city_code,
        city_name: r.city_name,
        area_name: r.area_name,
        address: r.address,
        phone: r.phone,
        lat: r.lat ? Number(r.lat) : null,
        lng: r.lng ? Number(r.lng) : null,
        hospital_level: r.hospital_level,
        waiting_consultation: r.waiting_consultation,
        waiting_bed: r.waiting_bed,
        waiting_admission: r.waiting_admission,
        waiting_icu: r.waiting_icu,
        is_full_reported: r.is_full_reported === 1,
        full_reported_note: r.full_reported_note,
        congestion_level: r.congestion_level as CongestionLevel,
        reported_at: r.reported_at,
        updated_at: r.updated_at,
        distance_km: r.distance_km !== undefined ? Math.round(r.distance_km * 10) / 10 : undefined,
        trend_sparkline: sparkline,
        trend_direction: direction,
      };
    });

    return {
      ok: true,
      totalHospitals: Number(stats.total) || items.length,
      criticalCount: Number(stats.critical_count) || 0,
      busyCount: Number(stats.busy_count) || 0,
      normalCount: Number(stats.normal_count) || 0,
      fullReportedCount: Number(stats.full_count) || 0,
      updatedAt: stats.latest_report || new Date().toISOString(),
      items,
    };
  });
}

/**
 * 側邊欄專用：取得在地核心急診狀況小卡（取 3 間大型醫院）
 */
export async function getSidebarEmergencyHighlights(cityCode = "TPE"): Promise<{
  cityCode: string;
  cityName: string;
  hasFullReported: boolean;
  hospitals: Array<{
    name: string;
    waitingConsultation: number;
    congestion: CongestionLevel;
    isFull: boolean;
  }>;
}> {
  return await withConnection(async (conn) => {
    const [rows] = await conn.query<ErRow[]>(
      `
      SELECT hospital_name, city_name, waiting_consultation, congestion_level, is_full_reported
      FROM emergency_room_status
      WHERE city_code = ?
      ORDER BY is_full_reported DESC, hospital_level = '醫學中心' DESC, waiting_consultation DESC
      LIMIT 3
      `,
      [cityCode]
    );

    let cityName = "全台";
    let hasFullReported = false;

    const list = rows.map((r) => {
      cityName = r.city_name;
      if (r.is_full_reported === 1) hasFullReported = true;
      return {
        name: r.hospital_name.replace(/國立臺灣大學醫學院附設醫院/, "台大醫院").replace(/醫療財團法人徐元智先生醫藥基金會/, "").replace(/長庚醫療財團法人/, "").replace(/台灣基督教長老教會馬偕醫療財團法人/, "").replace(/佛教慈濟醫療財團法人/, ""),
        waitingConsultation: r.waiting_consultation,
        congestion: r.congestion_level as CongestionLevel,
        isFull: r.is_full_reported === 1,
      };
    });

    return {
      cityCode,
      cityName,
      hasFullReported,
      hospitals: list,
    };
  });
}

/**
 * 依醫院名稱或機構代碼精確比對即時急診狀態（供 /tools/clinics 卡片關聯徽章）
 */
export async function getEmergencyStatusByHospital(
  hospitalCodeOrName: string
): Promise<EmergencyRoomItem | null> {
  return await withConnection(async (conn) => {
    const [rows] = await conn.query<ErRow[]>(
      `
      SELECT *
      FROM emergency_room_status
      WHERE hospital_code = ? OR hospital_name LIKE ?
      LIMIT 1
      `,
      [hospitalCodeOrName, `%${hospitalCodeOrName}%`]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      hospital_code: r.hospital_code,
      hospital_name: r.hospital_name,
      city_code: r.city_code,
      city_name: r.city_name,
      area_name: r.area_name,
      address: r.address,
      phone: r.phone,
      lat: r.lat ? Number(r.lat) : null,
      lng: r.lng ? Number(r.lng) : null,
      hospital_level: r.hospital_level,
      waiting_consultation: r.waiting_consultation,
      waiting_bed: r.waiting_bed,
      waiting_admission: r.waiting_admission,
      waiting_icu: r.waiting_icu,
      is_full_reported: r.is_full_reported === 1,
      full_reported_note: r.full_reported_note,
      congestion_level: r.congestion_level as CongestionLevel,
      reported_at: r.reported_at,
    };
  });
}
