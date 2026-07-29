import type { RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

export interface DrugIngredientRecord {
  licenseNo: string;
  prescriptionLabel: string | null;
  ingredientName: string;
  ingredientCode: string | null;
  contentDescription: string | null;
  contentAmount: string | null;
  contentUnit: string | null;
}

export interface DrugIngredientItem {
  prescription_label: string | null;
  ingredient_name: string;
  ingredient_code: string | null;
  content_description: string | null;
  content_amount: string | null;
  content_unit: string | null;
}

const buildRowKey = (r: DrugIngredientRecord): string =>
  createHash("sha256")
    .update(`${r.licenseNo}|${r.ingredientCode}|${r.ingredientName}|${r.contentDescription}|${r.contentAmount}|${r.contentUnit}`)
    .digest("hex");

const UPSERT_BATCH_SIZE = 500;

/** Upserts a batch of (license × ingredient) rows, keyed by a hash of the full row (no clean natural key — see schema.ts). */
export const upsertDrugIngredients = async (records: DrugIngredientRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [
        buildRowKey(r),
        r.licenseNo,
        r.prescriptionLabel,
        r.ingredientName,
        r.ingredientCode,
        r.contentDescription,
        r.contentAmount,
        r.contentUnit,
        now,
        now,
        now,
      ]);

      const [result] = await conn.query(
        `
        INSERT INTO tfda_drug_ingredients
          (row_key, license_no, prescription_label, ingredient_name, ingredient_code, content_description, content_amount, content_unit, synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
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

export const getIngredientsByLicenseNo = async (licenseNo: string): Promise<DrugIngredientItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT prescription_label, ingredient_name, ingredient_code, content_description, content_amount, content_unit
       FROM tfda_drug_ingredients
       WHERE license_no = ?
       ORDER BY id ASC`,
      [licenseNo],
    );
    return rows as unknown as DrugIngredientItem[];
  });
