import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";

export interface TaxOrganizationItem {
  id: number;
  name: string;
  city: string;
  ban: string | null;
  changeDate: string | null;
  reason: string | null;
  serviceItem: string | null;
}

const mapRowToItem = (r: RowDataPacket): TaxOrganizationItem => {
  let ban: string | null = null;
  let city: string = r.address || "";
  let changeDate: string | null = null;
  let reason: string | null = null;

  if (r.extra_json) {
    try {
      const extra = typeof r.extra_json === "string" ? JSON.parse(r.extra_json) : r.extra_json;
      if (extra.ban) ban = extra.ban;
      if (extra.city) city = extra.city;
      if (extra.changeDate) changeDate = extra.changeDate;
      if (extra.reason) reason = extra.reason;
    } catch {
      // fallback
    }
  }

  if (!ban && r.service_item) {
    const match = String(r.service_item).match(/統編：(\d{8})/);
    if (match) ban = match[1];
  }

  if (!changeDate && r.service_time) {
    const match = String(r.service_time).match(/最近異動：(\d+)/);
    if (match) changeDate = match[1];
  }

  return {
    id: r.id,
    name: r.name || "",
    city: city || "其他",
    ban,
    changeDate,
    reason,
    serviceItem: r.service_item || null,
  };
};

export const getRecentTaxOrganizations = async (
  limit = 30,
): Promise<TaxOrganizationItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, name, address, service_item, service_time, extra_json
       FROM facilities
       WHERE facility_type = 'tax_organization'
       ORDER BY id DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map(mapRowToItem);
  });

export interface SearchTaxOrganizationsParams {
  keyword?: string;
  city?: string;
  limit?: number;
}

export const searchTaxOrganizations = async ({
  keyword,
  city,
  limit = 50,
}: SearchTaxOrganizationsParams): Promise<TaxOrganizationItem[]> =>
  withConnection(async (conn) => {
    const conditions: string[] = ["facility_type = 'tax_organization'"];
    const params: unknown[] = [];

    if (keyword) {
      conditions.push("(name LIKE ? OR service_item LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    if (city && city !== "全部縣市") {
      conditions.push("address LIKE ?");
      params.push(`%${city}%`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const query = `
      SELECT id, name, address, service_item, service_time, extra_json
      FROM facilities
      ${whereClause}
      ORDER BY id DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows.map(mapRowToItem);
  });

export const getTaxOrganizationCities = async (): Promise<string[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT address AS city
       FROM facilities
       WHERE facility_type = 'tax_organization' AND address IS NOT NULL AND address != ''
       ORDER BY address ASC`,
    );
    return rows.map((r) => r.city).filter((c) => c && c !== "中華民國");
  });

