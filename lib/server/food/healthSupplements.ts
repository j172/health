import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";

export interface HealthSupplementRecord {
  licenseNo: string;
  category: string | null;
  nameZh: string;
  approvedAt: string | null;
  applicant: string | null;
  status: string | null;
  functionIngredients: string | null;
  functionText: string | null;
  claim: string | null;
  warning: string | null;
  notice: string | null;
  sourceUrl: string | null;
}

export interface HealthSupplementSummary {
  license_no: string;
  category: string | null;
  name_zh: string;
  approved_at: string | null;
  applicant: string | null;
  status: string | null;
  function_ingredients: string | null;
  function_text: string | null;
  claim: string | null;
  warning: string | null;
  notice: string | null;
  source_url: string | null;
}

/** Upserts a batch of 健康食品(健字號) rows, keyed by license_no. */
export const upsertHealthSupplements = (
  records: HealthSupplementRecord[],
): Promise<{ inserted: number; updated: number }> =>
  chunkedUpsert(
    records,
    `
    INSERT INTO tfda_health_supplements
      (license_no, category, name_zh, approved_at, applicant, status, function_ingredients, function_text, claim, warning, notice, source_url,
       synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      name_zh = VALUES(name_zh),
      approved_at = VALUES(approved_at),
      applicant = VALUES(applicant),
      status = VALUES(status),
      function_ingredients = VALUES(function_ingredients),
      function_text = VALUES(function_text),
      claim = VALUES(claim),
      warning = VALUES(warning),
      notice = VALUES(notice),
      source_url = VALUES(source_url),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.licenseNo,
      r.category,
      r.nameZh,
      r.approvedAt,
      r.applicant,
      r.status,
      r.functionIngredients,
      r.functionText,
      r.claim,
      r.warning,
      r.notice,
      r.sourceUrl,
      now,
      now,
      now,
    ],
  );

/** Searches 健康食品(健字號) by name/function keyword, optionally restricted to currently-核可 (active) licenses. */
export const searchHealthSupplements = async (options: {
  keyword?: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<HealthSupplementSummary[]> =>
  withConnection(async (conn) => {
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 30), 1), 100);
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    const keyword = options.keyword?.trim();
    if (keyword) {
      clauses.push("(name_zh LIKE ? OR function_ingredients LIKE ? OR function_text LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (options.activeOnly) {
      clauses.push("status = '核可'");
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(limit);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT license_no, category, name_zh, DATE_FORMAT(approved_at, '%Y-%m-%d') AS approved_at,
              applicant, status, function_ingredients, function_text, claim, warning, notice, source_url
       FROM tfda_health_supplements
       ${whereSql}
       ORDER BY name_zh ASC
       LIMIT ?`,
      params,
    );
    return rows as unknown as HealthSupplementSummary[];
  });
