import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

// 環境部 (MOENV) 碳足跡排放係數 — CFP_P_02 (issue #131). Lives alongside
// queries.ts (CFP_P_01 產品碳足跡) in this same carbonFootprint/ directory per
// the issue's note to reuse the carbon-footprint data layer, but targets its
// own table (carbon_footprint_coefficients) since the two datasets' fields
// don't overlap — see lib/server/db/schema.ts for the rationale.

export interface CarbonFootprintCoefficientRecord {
  coefficientName: string;
  coefficientValue: number | null;
  unit: string | null;
  /** '' (not null) when MOENV doesn't disclose a department — see schema.ts's note on the unique key. */
  departmentName: string;
  announcementYear: string;
}

export interface CarbonFootprintCoefficientListItem {
  id: number;
  coefficient_name: string;
  coefficient_value: number | null;
  unit: string | null;
  department_name: string;
  announcement_year: string;
}

export const upsertCarbonFootprintCoefficients = async (
  records: CarbonFootprintCoefficientRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO carbon_footprint_coefficients
      (coefficient_name, coefficient_value, unit, department_name, announcement_year, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      coefficient_value = VALUES(coefficient_value),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [r.coefficientName, r.coefficientValue, r.unit, r.departmentName, r.announcementYear, now, now, now],
  );

export interface CarbonFootprintCoefficientPageParams {
  keyword?: string;
  limit: number;
  offset: number;
}

/**
 * Reference-table listing, newest announcement year first (this dataset has
 * no per-row timestamp of its own, so announcement_year is the closest proxy
 * to "最新"), falling back to name for a stable order within the same year.
 */
export const getCarbonFootprintCoefficientsPage = async ({
  keyword,
  limit,
  offset,
}: CarbonFootprintCoefficientPageParams): Promise<{
  rows: CarbonFootprintCoefficientListItem[];
  total: number;
}> =>
  withConnection(async (conn) => {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (keyword) {
      conditions.push("(coefficient_name LIKE ? OR department_name LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM carbon_footprint_coefficients ${whereClause}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT id, coefficient_name, coefficient_value, unit, department_name, announcement_year
      FROM carbon_footprint_coefficients
      ${whereClause}
      ORDER BY announcement_year DESC, coefficient_name ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    return { total, rows: rows as unknown as CarbonFootprintCoefficientListItem[] };
  });
