import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";

export interface DengueVillagePoint {
  id: number;
  villageId: string;
  county: string;
  town: string;
  village: string;
  lng: number;
  lat: number;
  surveyDate: string;
  bi: number | null;
  biLv: number | null;
  hi: number | null;
  hiLv: number | null;
  ci: number | null;
  ciLv: number | null;
  li: number | null;
  liLv: number | null;
  ai: number | null;
  con100hh: number | null;
}

export interface DengueMapData {
  points: DengueVillagePoint[];
  /** Most recent sync timestamp, or null if the table is empty. Drives the "資料更新時間" header. */
  updatedAt: string | null;
}

const toNumOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Reads every dengue_vector_surveys row — one row per village nationwide (a
 * few thousand), small enough to fetch in one shot for the map. */
export async function getDengueMapData(): Promise<DengueMapData> {
  return withConnectionFallback({ points: [], updatedAt: null }, async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, village_id, county, town, village, longitude, latitude, survey_date,
              bi, bi_lv, hi, hi_lv, ci, ci_lv, li, li_lv, ai, con100hh, source_updated_at
         FROM dengue_vector_surveys
        ORDER BY county, town, village`,
    );

    let latestUpdatedAt: string | null = null;
    const points: DengueVillagePoint[] = rows.map((row) => {
      const sourceUpdatedAt: string | null = row.source_updated_at
        ? new Date(row.source_updated_at).toISOString()
        : null;
      if (sourceUpdatedAt && (!latestUpdatedAt || sourceUpdatedAt > latestUpdatedAt)) {
        latestUpdatedAt = sourceUpdatedAt;
      }

      return {
        id: Number(row.id),
        villageId: String(row.village_id),
        county: String(row.county),
        town: String(row.town),
        village: String(row.village),
        lng: Number(row.longitude),
        lat: Number(row.latitude),
        surveyDate:
          row.survey_date instanceof Date
            ? row.survey_date.toISOString().slice(0, 10)
            : String(row.survey_date),
        bi: toNumOrNull(row.bi),
        biLv: toNumOrNull(row.bi_lv),
        hi: toNumOrNull(row.hi),
        hiLv: toNumOrNull(row.hi_lv),
        ci: toNumOrNull(row.ci),
        ciLv: toNumOrNull(row.ci_lv),
        li: toNumOrNull(row.li),
        liLv: toNumOrNull(row.li_lv),
        ai: toNumOrNull(row.ai),
        con100hh: toNumOrNull(row.con100hh),
      };
    });

    return { points, updatedAt: latestUpdatedAt };
  });
}
