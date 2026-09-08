import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

export interface GreenProductRecord {
  flagNo: string;
  productName: string;
  classType: string | null;
  signDate: string | null;
  expireDate: string | null;
  dateExtendDate: string | null;
  isExpire: string | null;
}

export interface GreenProductListItem {
  id: number;
  flag_no: string;
  product_name: string;
  class_type: string | null;
  sign_date: string | null;
  expire_date: string | null;
  date_extend_date: string | null;
  is_expire: string | null;
}

export const upsertGreenProducts = async (
  records: GreenProductRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO green_products
      (flag_no, product_name, class_type, sign_date, expire_date, date_extend_date, is_expire, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      product_name = VALUES(product_name),
      class_type = VALUES(class_type),
      sign_date = VALUES(sign_date),
      expire_date = VALUES(expire_date),
      date_extend_date = VALUES(date_extend_date),
      is_expire = VALUES(is_expire),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.flagNo,
      r.productName,
      r.classType,
      r.signDate,
      r.expireDate,
      r.dateExtendDate,
      r.isExpire,
      now,
      now,
      now,
    ],
  );
};

export const getRecentGreenProducts = async (
  limit = 30,
  offset = 0,
): Promise<GreenProductListItem[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, flag_no, product_name, class_type, sign_date, expire_date, date_extend_date, is_expire
       FROM green_products
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    return rows as unknown as GreenProductListItem[];
  });

/** Total rows in green_products — pairs with getRecentGreenProducts() for pagination (issue #157). */
export const countGreenProducts = async (): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM green_products`);
    return Number(rows[0]?.total ?? 0);
  });

export interface SearchGreenProductsParams {
  keyword?: string;
  classType?: string;
  limit?: number;
  offset?: number;
}

const buildSearchGreenProductsWhere = ({ keyword, classType }: Pick<SearchGreenProductsParams, "keyword" | "classType">) => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (keyword) {
    conditions.push("(product_name LIKE ? OR flag_no LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (classType) {
    conditions.push("class_type = ?");
    params.push(classType);
  }

  return { whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params };
};

export const searchGreenProducts = async ({
  keyword,
  classType,
  limit = 50,
  offset = 0,
}: SearchGreenProductsParams): Promise<GreenProductListItem[]> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildSearchGreenProductsWhere({ keyword, classType });
    const query = `
      SELECT id, flag_no, product_name, class_type, sign_date, expire_date, date_extend_date, is_expire
      FROM green_products
      ${whereClause}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [rows] = await conn.query<RowDataPacket[]>(query, params);
    return rows as unknown as GreenProductListItem[];
  });

/** Total rows matching the same filters as searchGreenProducts() — pairs with it for pagination (issue #157). */
export const countSearchGreenProducts = async ({
  keyword,
  classType,
}: Pick<SearchGreenProductsParams, "keyword" | "classType">): Promise<number> =>
  withConnection(async (conn) => {
    const { whereClause, params } = buildSearchGreenProductsWhere({ keyword, classType });
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM green_products ${whereClause}`, params);
    return Number(rows[0]?.total ?? 0);
  });

export const getGreenProductCategories = async (): Promise<string[]> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT class_type
       FROM green_products
       WHERE class_type IS NOT NULL AND class_type != ''
       ORDER BY class_type ASC`,
    );
    return (rows as { class_type: string }[]).map((r) => r.class_type);
  });

