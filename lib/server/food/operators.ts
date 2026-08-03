import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

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

/** Upserts a batch of food-operator registration rows, keyed by registration_no. Chunked — the source has 825k+ rows. */
export const upsertFoodOperators = (records: FoodOperatorRecord[]): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
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
    (r, now) => [r.registrationNo, r.companyName, r.unifiedBusinessNo, r.address, r.registrationType, now, now, now],
  );

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
