import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import { splitRejectionReasons } from "@/lib/server/borderFood/reasons";
import type {
  BorderFoodFacetCount,
  BorderFoodFacets,
  BorderFoodRejectionFilters,
  BorderFoodRejectionItem,
  BorderFoodRejectionRecord,
  BorderFoodRejectionsPage,
} from "@/lib/server/borderFood/types";

/**
 * DB access for the 邊境查驗不合格食品 feature (issue #671). The table has no
 * importer-address or image column (see schema.ts), and every SELECT below
 * names its columns explicitly — never `SELECT *` — so a column added to the
 * table later cannot leak onto the page by accident.
 */

export interface BorderFoodUpsertResult {
  inserted: number;
  updated: number;
  /** The shared `synced_at` stamp every row of this run received; feed it to the stale-row sweep. */
  syncedAt: string;
}

/**
 * Upserts merged records keyed by row_hash — matches the table's only UNIQUE
 * KEY. Every column is overwritten and `synced_at` is stamped with one shared
 * value per run, which is what lets the sweep below tell "seen this run" from
 * "no longer listed upstream" without ever touching a time column in the key.
 */
export const upsertBorderFoodRejections = async (
  records: BorderFoodRejectionRecord[],
): Promise<BorderFoodUpsertResult> => {
  if (records.length === 0) return { inserted: 0, updated: 0, syncedAt: utcNowSql() };

  let syncedAt = "";
  const { inserted, updated } = await chunkedUpsert(
    records,
    `
    INSERT INTO border_food_rejections
      (row_hash, origin_country, subject, reason, importer_name, hs_code, inspection_method,
       detail, legal_limit, manufacturer_name, brand_name, weight, disposition,
       published_on, inspection_accepted_on, duplicate_count, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      origin_country = VALUES(origin_country),
      subject = VALUES(subject),
      reason = VALUES(reason),
      importer_name = VALUES(importer_name),
      hs_code = VALUES(hs_code),
      inspection_method = VALUES(inspection_method),
      detail = VALUES(detail),
      legal_limit = VALUES(legal_limit),
      manufacturer_name = VALUES(manufacturer_name),
      brand_name = VALUES(brand_name),
      weight = VALUES(weight),
      disposition = VALUES(disposition),
      published_on = VALUES(published_on),
      inspection_accepted_on = VALUES(inspection_accepted_on),
      duplicate_count = VALUES(duplicate_count),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => {
      syncedAt = now;
      return [
        r.rowHash,
        r.originCountry,
        r.subject,
        r.reason,
        r.importerName,
        r.hsCode,
        r.inspectionMethod,
        r.detail,
        r.legalLimit,
        r.manufacturerName,
        r.brandName,
        r.weight,
        r.disposition,
        r.publishedOn,
        r.inspectionAcceptedOn,
        r.duplicateCount,
        now,
        now,
        now,
      ];
    },
  );
  return { inserted, updated, syncedAt };
};

/**
 * Rolling-snapshot sweep: removes rows the latest successful upsert did not
 * touch (their synced_at is older than this run's stamp), i.e. rows that have
 * dropped out of the upstream list. Callers MUST have passed the snapshot
 * guard (reconcile.ts) and finished the upsert first.
 */
export const deleteBorderFoodRejectionsNotSyncedSince = async (syncedAt: string): Promise<number> =>
  withConnection(async (conn) => {
    const [result] = await conn.query(`DELETE FROM border_food_rejections WHERE synced_at < ?`, [syncedAt]);
    return (result as { affectedRows: number }).affectedRows;
  });

export const countBorderFoodRejections = async (): Promise<number> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM border_food_rejections`);
    return Number(rows[0]?.total ?? 0);
  });

/** Escapes LIKE wildcards so user input is matched literally (MySQL's default escape char is backslash). */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

const buildWhere = (filters: BorderFoodRejectionFilters): { sql: string; params: unknown[] } => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.origin) {
    clauses.push("origin_country = ?");
    params.push(filters.origin);
  }
  if (filters.reason) {
    clauses.push("reason LIKE ?");
    params.push(`%${escapeLike(filters.reason)}%`);
  }
  if (filters.from) {
    clauses.push("published_on >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push("published_on <= ?");
    params.push(filters.to);
  }
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    clauses.push("(subject LIKE ? OR brand_name LIKE ? OR manufacturer_name LIKE ? OR detail LIKE ?)");
    params.push(like, like, like, like);
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
};

const mapItem = (row: RowDataPacket): BorderFoodRejectionItem => ({
  id: Number(row.id),
  publishedOn: row.published_on_str ?? null,
  inspectionAcceptedOn: row.inspection_accepted_on_str ?? null,
  originCountry: String(row.origin_country),
  subject: String(row.subject),
  reason: String(row.reason),
  reasons: splitRejectionReasons(String(row.reason)),
  importerName: row.importer_name ?? null,
  hsCode: row.hs_code ?? null,
  inspectionMethod: row.inspection_method ?? null,
  detail: row.detail ?? null,
  legalLimit: row.legal_limit ?? null,
  manufacturerName: row.manufacturer_name ?? null,
  brandName: row.brand_name ?? null,
  weight: row.weight ?? null,
  disposition: row.disposition ?? null,
  duplicateCount: Number(row.duplicate_count ?? 1),
});

const loadFacets = async (conn: PoolConnection): Promise<BorderFoodFacets> => {
  const [summaryRows] = await conn.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            DATE_FORMAT(MIN(published_on), '%Y-%m-%d') AS earliest,
            DATE_FORMAT(MAX(published_on), '%Y-%m-%d') AS latest,
            DATE_FORMAT(MAX(synced_at), '%Y-%m-%dT%H:%i:%sZ') AS last_synced
     FROM border_food_rejections`,
  );
  const [originRows] = await conn.query<RowDataPacket[]>(
    `SELECT origin_country AS name, COUNT(*) AS cnt
     FROM border_food_rejections
     GROUP BY origin_country
     ORDER BY cnt DESC, name ASC`,
  );
  const [reasonRows] = await conn.query<RowDataPacket[]>(
    `SELECT reason, COUNT(*) AS cnt FROM border_food_rejections GROUP BY reason`,
  );

  const reasonCounts = new Map<string, number>();
  for (const row of reasonRows) {
    for (const reason of splitRejectionReasons(String(row.reason))) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + Number(row.cnt));
    }
  }
  const reasons: BorderFoodFacetCount[] = [...reasonCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));

  const summary = summaryRows[0] ?? {};
  return {
    total: Number(summary.total ?? 0),
    origins: originRows.map((row) => ({ name: String(row.name), count: Number(row.cnt) })),
    reasons,
    earliestPublishedOn: summary.earliest ?? null,
    latestPublishedOn: summary.latest ?? null,
    lastSyncedAt: summary.last_synced ?? null,
  };
};

/**
 * One page of rejected-food rows (newest 發布日 first) plus the unfiltered
 * facets the filter controls need (origin list, reason list, date bounds,
 * last sync time). Table sizes are in the low thousands, so the facet
 * aggregation per request is cheap; the API route adds edge caching.
 */
export const getBorderFoodRejectionsPage = async (
  filters: BorderFoodRejectionFilters,
  page: number,
  pageSize: number,
): Promise<BorderFoodRejectionsPage> =>
  withConnection(async (conn) => {
    const { sql: whereSql, params } = buildWhere(filters);
    const offset = (page - 1) * pageSize;

    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM border_food_rejections ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const [itemRows] = await conn.query<RowDataPacket[]>(
      `SELECT id,
              DATE_FORMAT(published_on, '%Y-%m-%d') AS published_on_str,
              DATE_FORMAT(inspection_accepted_on, '%Y-%m-%d') AS inspection_accepted_on_str,
              origin_country, subject, reason, importer_name, hs_code, inspection_method,
              detail, legal_limit, manufacturer_name, brand_name, weight, disposition, duplicate_count
       FROM border_food_rejections
       ${whereSql}
       ORDER BY published_on DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const facets = await loadFacets(conn);
    return { items: itemRows.map(mapItem), total, page, pageSize, facets };
  });
