import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

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

/** Upserts a batch of (food sample × analysis item) rows, keyed by (sample_id, nutrient_category, nutrient_item). Chunked — the source has 226k+ rows. */
export const upsertFoodNutrition = (records: FoodNutritionRecord[]): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
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
    (r, now) => [
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
    ],
  );

/** Distinct food samples matching a keyword — one row per sample_id, not per nutrient. */
export const searchFoodSamples = async (keyword: string, limit = 30, offset = 0): Promise<FoodSampleSummary[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT sample_id, MIN(sample_name) AS sample_name, MIN(common_name) AS common_name, MIN(sample_name_en) AS sample_name_en, MIN(food_category) AS food_category
       FROM tfda_food_nutrition
       WHERE sample_name LIKE ? OR common_name LIKE ? OR sample_name_en LIKE ?
       GROUP BY sample_id
       ORDER BY sample_name ASC
       LIMIT ? OFFSET ?`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit, offset],
    );
    return rows as unknown as FoodSampleSummary[];
  });

/** Total distinct food samples matching a keyword — pairs with searchFoodSamples() for pagination (issue #157). */
export const countSearchFoodSamples = async (keyword: string): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT sample_id) AS total
       FROM tfda_food_nutrition
       WHERE sample_name LIKE ? OR common_name LIKE ? OR sample_name_en LIKE ?`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`],
    );
    return Number(rows[0]?.total ?? 0);
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

/** Defensively parses a `value_per_100g`-shaped VARCHAR (source data mixes real numbers with placeholders like `Tr`/`-`). Returns `null` for anything non-numeric rather than throwing or coercing to `0`. */
export const parseNutrientValue = (raw: string | null | undefined): number | null => {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

export interface MealItemInput {
  sampleId: string;
  grams: number;
}

export interface MealNutrientAmount {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  value: number | null;
}

export interface MealFoodBreakdown {
  sample_id: string;
  sample_name: string | null;
  grams: number;
  items: MealNutrientAmount[];
}

export interface MealNutrientTotal {
  nutrient_category: string;
  nutrient_item: string;
  unit: string | null;
  total_value: number;
}

export interface MealAnalysisResult {
  foods: MealFoodBreakdown[];
  totals: MealNutrientTotal[];
}

/** Scales each food's per-100g nutrient values by its `grams` and sums across all foods, keyed by (nutrient_category, nutrient_item). Skips rows whose value_per_100g isn't numeric rather than treating them as 0. */
export const analyzeMealNutrition = async (items: MealItemInput[]): Promise<MealAnalysisResult> =>
  withConnection(async (conn) => {
    const foods: MealFoodBreakdown[] = [];
    const totalsByKey = new Map<string, MealNutrientTotal>();

    for (const item of items) {
      const grams = Number(item.grams);
      if (!item.sampleId || !Number.isFinite(grams) || grams <= 0) continue;

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT sample_name, nutrient_category, nutrient_item, unit, value_per_100g
         FROM tfda_food_nutrition
         WHERE sample_id = ?`,
        [item.sampleId],
      );
      const nutrientRows = rows as unknown as {
        sample_name: string | null;
        nutrient_category: string;
        nutrient_item: string;
        unit: string | null;
        value_per_100g: string | null;
      }[];

      const breakdown: MealNutrientAmount[] = nutrientRows.map((row) => {
        const per100g = parseNutrientValue(row.value_per_100g);
        const value = per100g === null ? null : (per100g * grams) / 100;

        if (value !== null) {
          const key = `${row.nutrient_category}\u0000${row.nutrient_item}`;
          const existing = totalsByKey.get(key);
          if (existing) {
            existing.total_value += value;
          } else {
            totalsByKey.set(key, {
              nutrient_category: row.nutrient_category,
              nutrient_item: row.nutrient_item,
              unit: row.unit,
              total_value: value,
            });
          }
        }

        return { nutrient_category: row.nutrient_category, nutrient_item: row.nutrient_item, unit: row.unit, value };
      });

      foods.push({
        sample_id: item.sampleId,
        sample_name: nutrientRows[0]?.sample_name ?? null,
        grams,
        items: breakdown,
      });
    }

    return { foods, totals: [...totalsByKey.values()] };
  });

export interface FoodNutrientRankRow {
  sample_id: string;
  sample_name: string | null;
  value_per_100g: string | null;
}

/** Ranks foods by one `nutrient_item`, descending. Excludes rows whose `value_per_100g` isn't a plain non-negative decimal (via REGEXP before the CAST), rather than letting `CAST` silently coerce non-numeric placeholders to 0. */
export const rankFoodsByNutrient = async (
  nutrientItem: string,
  options: { limit?: number; category?: string } = {},
): Promise<FoodNutrientRankRow[]> =>
  withConnection(async (conn) => {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100);
    const params: (string | number)[] = [nutrientItem];
    const category = options.category?.trim();
    const categoryClause = category ? "AND food_category = ?" : "";
    if (category) params.push(category);
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT sample_id, sample_name, value_per_100g
       FROM tfda_food_nutrition
       WHERE nutrient_item = ?
         AND value_per_100g REGEXP '^[0-9]+(\\\\.[0-9]+)?$'
         ${categoryClause}
       ORDER BY CAST(value_per_100g AS DECIMAL(10,2)) DESC
       LIMIT ?`,
      params,
    );
    return rows as unknown as FoodNutrientRankRow[];
  });

/** Distinct `nutrient_item` labels actually present in the table, for populating a ranking-tool dropdown (the exact Chinese labels vary and shouldn't be hardcoded). */
export const listDistinctNutrientItems = async (): Promise<string[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT nutrient_item FROM tfda_food_nutrition ORDER BY nutrient_item ASC`,
    );
    return (rows as unknown as { nutrient_item: string }[]).map((row) => row.nutrient_item);
  });
