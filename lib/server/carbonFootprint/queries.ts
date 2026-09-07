import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

export interface CarbonFootprintProductRecord {
  cfplCode: string;
  productName: string;
  companyName: string | null;
  carbonFootprintData: string | null;
  declaredUnit: string | null;
  expireDate: string | null;
}

export interface CarbonFootprintProductListItem {
  id: number;
  cfpl_code: string;
  product_name: string;
  company_name: string | null;
  carbon_footprint_data: string | null;
  declared_unit: string | null;
  expire_date: string | null;
}

export const upsertCarbonFootprintProducts = async (
  records: CarbonFootprintProductRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO carbon_footprint_products
      (cfpl_code, product_name, company_name, carbon_footprint_data, declared_unit, expire_date, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      product_name = VALUES(product_name),
      company_name = VALUES(company_name),
      carbon_footprint_data = VALUES(carbon_footprint_data),
      declared_unit = VALUES(declared_unit),
      expire_date = VALUES(expire_date),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.cfplCode,
      r.productName,
      r.companyName,
      r.carbonFootprintData,
      r.declaredUnit,
      r.expireDate,
      now,
      now,
      now,
    ],
  );
};

export const getRecentCarbonFootprintProducts = async (
  limit = 30,
): Promise<CarbonFootprintProductListItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, cfpl_code, product_name, company_name, carbon_footprint_data, declared_unit, expire_date
       FROM carbon_footprint_products
       ORDER BY id DESC
       LIMIT ?`,
      [limit],
    );
    return rows as unknown as CarbonFootprintProductListItem[];
  });

export interface SearchCarbonFootprintProductsParams {
  keyword?: string;
  limit?: number;
}

export const searchCarbonFootprintProducts = async ({
  keyword,
  limit = 50,
}: SearchCarbonFootprintProductsParams): Promise<CarbonFootprintProductListItem[]> =>
  withConnection(async (conn) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (keyword) {
      conditions.push("(product_name LIKE ? OR company_name LIKE ? OR cfpl_code LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT id, cfpl_code, product_name, company_name, carbon_footprint_data, declared_unit, expire_date
      FROM carbon_footprint_products
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows as unknown as CarbonFootprintProductListItem[];
  });
