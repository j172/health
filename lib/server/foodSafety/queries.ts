import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { PESTICIDE_STANDARDS_SEED } from "./data/pesticideSeed";
import type {
  FoodPesticideStandardItem,
  CropCategory,
  PesticideOverviewResult,
  PesticideRiskLevel,
  TopPesticideInfo,
} from "./types";

interface DbStandardRow extends RowDataPacket {
  id: number;
  category: string;
  crop_name: string;
  crop_name_en: string | null;
  common_names: string | null;
  pass_rate: number | string;
  sample_count: number;
  risk_level: string;
  top_pesticides: any;
  washing_guide: string;
  seasonal_months: string | null;
  avg_wholesale_price: number | string | null;
  created_at: Date;
  updated_at: Date;
}

const mapRowToItem = (row: DbStandardRow): FoodPesticideStandardItem => {
  let topPesticides: TopPesticideInfo[] = [];
  try {
    if (typeof row.top_pesticides === "string") {
      topPesticides = JSON.parse(row.top_pesticides);
    } else if (Array.isArray(row.top_pesticides)) {
      topPesticides = row.top_pesticides;
    }
  } catch {
    topPesticides = [];
  }

  return {
    id: row.id,
    category: row.category as CropCategory,
    cropName: row.crop_name,
    cropNameEn: row.crop_name_en,
    commonNames: row.common_names,
    passRate: Number(row.pass_rate) || 0,
    sampleCount: row.sample_count || 0,
    riskLevel: row.risk_level as PesticideRiskLevel,
    topPesticides,
    washingGuide: row.washing_guide,
    seasonalMonths: row.seasonal_months,
    avgWholesalePrice: row.avg_wholesale_price ? Number(row.avg_wholesale_price) : null,
  };
};

/**
 * 確保資料庫有資料，若空表自動由種子植入
 */
export async function ensureFoodSafetySeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [countRows] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM food_pesticide_standards"
    );
    if ((countRows[0]?.cnt ?? 0) === 0) {
      const nowSql = utcNowSql();
      const rows = PESTICIDE_STANDARDS_SEED.map((s) => [
        s.category,
        s.cropName,
        s.cropNameEn || null,
        s.commonNames || null,
        s.passRate,
        s.sampleCount,
        s.riskLevel,
        JSON.stringify(s.topPesticides || []),
        s.washingGuide,
        s.seasonalMonths || null,
        s.avgWholesalePrice || null,
        nowSql,
        nowSql,
      ]);

      await conn.query(
        `INSERT IGNORE INTO food_pesticide_standards
          (category, crop_name, crop_name_en, common_names, pass_rate, sample_count,
           risk_level, top_pesticides, washing_guide, seasonal_months, avg_wholesale_price,
           created_at, updated_at)
         VALUES ?`,
        [rows]
      );
    }
  });
}

/**
 * 查詢食安檢驗總覽與篩選
 */
export async function getFoodSafetyOverview(params?: {
  q?: string;
  category?: string;
  risk?: string;
}): Promise<PesticideOverviewResult> {
  await ensureFoodSafetySeeded();

  return await withConnection(async (conn) => {
    let sql = "SELECT * FROM food_pesticide_standards WHERE 1=1";
    const queryParams: any[] = [];

    if (params?.category && params.category !== "全部") {
      sql += " AND category = ?";
      queryParams.push(params.category);
    }

    if (params?.risk && params.risk !== "all") {
      sql += " AND risk_level = ?";
      queryParams.push(params.risk);
    }

    if (params?.q && params.q.trim()) {
      const keyword = `%${params.q.trim()}%`;
      sql += " AND (crop_name LIKE ? OR common_names LIKE ? OR crop_name_en LIKE ?)";
      queryParams.push(keyword, keyword, keyword);
    }

    sql += " ORDER BY pass_rate ASC, sample_count DESC";

    const [rows] = await conn.query<DbStandardRow[]>(sql, queryParams);
    const standards = rows.map(mapRowToItem);

    // 統計指標
    let totalPass = 0;
    let safeCount = 0;
    let modCount = 0;
    let highCount = 0;

    for (const item of standards) {
      totalPass += item.passRate;
      if (item.riskLevel === "low") safeCount++;
      else if (item.riskLevel === "moderate") modCount++;
      else highCount++;
    }

    const avgPassRate =
      standards.length > 0
        ? Number((totalPass / standards.length).toFixed(1))
        : 95.0;

    return {
      standards,
      totalCrops: standards.length,
      avgPassRate,
      safeCropCount: safeCount,
      moderateCropCount: modCount,
      highRiskCropCount: highCount,
      categories: ["葉菜類", "瓜果類", "豆菜類", "根莖類", "水果類", "香辛植物"],
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * 依蔬果品名查詢詳細食安與毒理報告
 */
export async function getFoodSafetyDetail(
  cropName: string
): Promise<FoodPesticideStandardItem | null> {
  await ensureFoodSafetySeeded();

  return await withConnection(async (conn) => {
    const [rows] = await conn.query<DbStandardRow[]>(
      "SELECT * FROM food_pesticide_standards WHERE crop_name = ? OR common_names LIKE ? LIMIT 1",
      [cropName, `%${cropName}%`]
    );

    if (rows.length === 0) return null;
    return mapRowToItem(rows[0]);
  });
}
