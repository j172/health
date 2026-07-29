import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

export interface FoodOperatorRecord {
  registrationNo: string;
  companyName: string | null;
  unifiedBusinessNo: string | null;
  address: string | null;
  registrationType: string | null;
}

export interface FoodOperatorItem {
  id: number;
  registration_no: string;
  company_name: string | null;
  unified_business_no: string | null;
  address: string | null;
  registration_type: string | null;
}

const UPSERT_BATCH_SIZE = 500;

/** Upserts a batch of food-operator registration rows, keyed by registration_no. Chunked — the source has 825k+ rows. */
export const upsertFoodOperators = async (records: FoodOperatorRecord[]): Promise<{ inserted: number; updated: number }> =>
  withConnection(async (conn) => {
    let inserted = 0;
    let updated = 0;
    const now = utcNowSql();

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [r.registrationNo, r.companyName, r.unifiedBusinessNo, r.address, r.registrationType, now, now, now]);

      const [result] = await conn.query(
        `
        INSERT INTO tfda_food_operators
          (registration_no, company_name, unified_business_no, address, registration_type, synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name),
          unified_business_no = VALUES(unified_business_no),
          address = VALUES(address),
          registration_type = VALUES(registration_type),
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

export const searchFoodOperators = async (keyword: string, limit = 50): Promise<FoodOperatorItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, registration_no, company_name, unified_business_no, address, registration_type
       FROM tfda_food_operators
       WHERE company_name LIKE ? OR unified_business_no LIKE ? OR registration_no LIKE ? OR address LIKE ?
       ORDER BY company_name ASC
       LIMIT ?`,
      [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit],
    );
    return rows as unknown as FoodOperatorItem[];
  });
