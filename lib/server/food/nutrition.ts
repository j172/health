import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

export interface FoodNutritionRecord {
  sampleId: string;
  foodCategory: string | null;
  dataCategory: string | null;
  sampleName: string | null;
  commonName: string | null;
  sampleNameEn: string | null;
  contentDescription: string | null;
  wasteRate: string | null;
  nutrientCategory: string;
  nutrientItem: string;
  unit: string | null;
  valuePer100g: string | null;
  sampleCount: string | null;
  stdDev: string | null;
  valuePerUnit: string | null;
  unitWeight: string | null;
  valuePerUnitWeight: string | null;
}

export interface FoodSampleSummary {
  sample_id: string;
  sample_name: string | null;
  common_name: string | null;
  sample_name_en: string | null;
  food_category: string | null;
}

export interface FoodNutritionItem {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  value_per_100g: string | null;
  sample_count: string | null;
  std_dev: string | null;
  value_per_unit: string | null;
  unit_weight: string | null;
  value_per_unit_weight: string | null;
}

const UPSERT_BATCH_SIZE = 500;

/** Upserts a batch of (food sample × analysis item) rows, keyed by (sample_id, nutrient_category, nutrient_item). Chunked — the source has 226k+ rows. */
export const upsertFoodNutrition = async (records: FoodNutritionRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [
        r.sampleId,
        r.foodCategory,
        r.dataCategory,
        r.sampleName,
        r.commonName,
        r.sampleNameEn,
        r.contentDescription,
        r.wasteRate,
        r.nutrientCategory,
        r.nutrientItem,
        r.unit,
        r.valuePer100g,
        r.sampleCount,
        r.stdDev,
        r.valuePerUnit,
        r.unitWeight,
        r.valuePerUnitWeight,
        now,
        now,
        now,
      ]);

      const [result] = await conn.query(
        `
        INSERT INTO tfda_food_nutrition
          (sample_id, food_category, data_category, sample_name, common_name, sample_name_en, content_description, waste_rate,
           nutrient_category, nutrient_item, unit, value_per_100g, sample_count, std_dev, value_per_unit, unit_weight, value_per_unit_weight,
           synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          food_category = VALUES(food_category),
          data_category = VALUES(data_category),
          sample_name = VALUES(sample_name),
          common_name = VALUES(common_name),
          sample_name_en = VALUES(sample_name_en),
          content_description = VALUES(content_description),
          waste_rate = VALUES(waste_rate),
          unit = VALUES(unit),
          value_per_100g = VALUES(value_per_100g),
          sample_count = VALUES(sample_count),
          std_dev = VALUES(std_dev),
          value_per_unit = VALUES(value_per_unit),
          unit_weight = VALUES(unit_weight),
          value_per_unit_weight = VALUES(value_per_unit_weight),
          synced_at = VALUES(synced_at),
          updated_at = VALUES(updated_at)
        `,
        [values],
      );

      // MySQL's upsert convention: affectedRows = 1 per new row + 2 per updated row.
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;
    }

    return { inserted, updated };
  });

/** Distinct food samples matching a keyword — one row per sample_id, not per nutrient. */
export const searchFoodSamples = async (keyword: string, limit = 30): Promise<FoodSampleSummary[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT sample_id, MIN(sample_name) AS sample_name, MIN(common_name) AS common_name, MIN(sample_name_en) AS sample_name_en, MIN(food_category) AS food_category
       FROM tfda_food_nutrition
       WHERE sample_name LIKE ? OR common_name LIKE ? OR sample_name_en LIKE ?
       GROUP BY sample_id
       ORDER BY sample_name ASC
       LIMIT ?`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit],
    );
    return rows as unknown as FoodSampleSummary[];
  });

/** All analysis-item rows for one food sample. */
export const getNutritionBySampleId = async (sampleId: string): Promise<FoodNutritionItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT nutrient_category, nutrient_item, unit, value_per_100g, sample_count, std_dev, value_per_unit, unit_weight, value_per_unit_weight
       FROM tfda_food_nutrition
       WHERE sample_id = ?
       ORDER BY nutrient_category ASC, nutrient_item ASC`,
      [sampleId],
    );
    return rows as unknown as FoodNutritionItem[];
  });
