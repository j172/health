import type { RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

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

/** Upserts a batch of (license × ingredient) rows, keyed by a hash of the full row (no clean natural key — see schema.ts). */
export const upsertDrugIngredients = (records: DrugIngredientRecord[]): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO tfda_drug_ingredients
      (row_key, license_no, prescription_label, ingredient_name, ingredient_code, content_description, content_amount, content_unit, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
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
    ],
  );

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
