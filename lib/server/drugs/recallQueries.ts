import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { decideSnapshotReconcile } from "@/lib/server/drugs/shortageSnapshot";
import { RECALL_LEVELS, RECALL_LEVEL_UNSPECIFIED, type DrugRecallRecord, type RecallLevel } from "@/lib/server/drugs/sources/tfdaDrugRecalls";

/** Rows per round-trip: batch_no runs to ~1.8 KB and reason to ~0.6 KB per row, so keep chunks modest. */
const UPSERT_BATCH_SIZE = 100;

export interface DrugRecallSnapshotResult {
  inserted: number;
  updated: number;
  deleted: number;
  /** Why the stale-row delete was skipped, or null when it ran (or had nothing to do). Surfaced to ingest_errors by the runner. */
  reconcileSkippedReason: string | null;
}

/**
 * Applies the fresh 6947 snapshot to drug_recalls (+ its license rows): upsert
 * every row by row_key, then — only if the snapshot looks plausibly complete
 * (the same guard B-4's shortage tables use, see decideSnapshotReconcile) —
 * remove the rows this run did not refresh, i.e. entries the upstream register
 * no longer lists (a corrected entry gets a new key, so its old row must go).
 *
 * "Did not refresh" is `synced_at < <this run's timestamp>`: every row the
 * upsert touches is stamped with that timestamp, so older stamps are exactly
 * the rows missing from the snapshot.
 */
export const replaceDrugRecallsSnapshot = async (records: DrugRecallRecord[]): Promise<DrugRecallSnapshotResult> =>
  withConnection(async (conn) => {
    const [countRows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM drug_recalls`);
    const existing = Number((countRows[0] as { total: number }).total);

    const syncedAt = utcNowSql();
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [
        r.rowKey,
        r.docNo,
        r.recalledOn,
        r.productName,
        r.licenseText,
        r.holderName,
        r.batchNo,
        r.reason,
        r.recallLevel,
        r.recallLevelRaw,
        syncedAt,
        syncedAt,
        syncedAt,
      ]);
      const [result] = await conn.query(
        `
        INSERT INTO drug_recalls
          (row_key, doc_no, recalled_on, product_name, license_text, holder_name, batch_no, reason, recall_level, recall_level_raw, synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          doc_no = VALUES(doc_no),
          recalled_on = VALUES(recalled_on),
          product_name = VALUES(product_name),
          license_text = VALUES(license_text),
          holder_name = VALUES(holder_name),
          batch_no = VALUES(batch_no),
          reason = VALUES(reason),
          recall_level = VALUES(recall_level),
          recall_level_raw = VALUES(recall_level_raw),
          synced_at = VALUES(synced_at),
          updated_at = VALUES(updated_at)
        `,
        [values],
      );
      // MySQL upsert convention: affectedRows = 1 per inserted row + 2 per updated row.
      const affected = (result as { affectedRows: number }).affectedRows;
      const chunkUpdated = affected - chunk.length;
      updated += chunkUpdated;
      inserted += chunk.length - chunkUpdated;

      const licenseValues = chunk.flatMap((r) => r.licenseNos.map((licenseNo) => [r.rowKey, licenseNo]));
      if (licenseValues.length > 0) {
        // The license set of a row_key never changes (the key hashes the license text), so IGNORE is enough.
        await conn.query(`INSERT IGNORE INTO drug_recall_licenses (recall_row_key, license_no) VALUES ?`, [licenseValues]);
      }
    }

    const decision = decideSnapshotReconcile({ fetched: records.length, existing, noDataPlaceholder: false });
    if (!decision.reconcile) {
      return { inserted, updated, deleted: 0, reconcileSkippedReason: decision.reason };
    }

    const [deleteResult] = await conn.query(`DELETE FROM drug_recalls WHERE synced_at < ?`, [syncedAt]);
    const deleted = (deleteResult as { affectedRows: number }).affectedRows;

    // License rows whose recall row is gone (just deleted above).
    await conn.query(
      `DELETE l FROM drug_recall_licenses l
       LEFT JOIN drug_recalls r ON r.row_key = l.recall_row_key
       WHERE r.id IS NULL`,
    );
    return { inserted, updated, deleted, reconcileSkippedReason: null };
  });

export interface DrugRecallListItem {
  id: number;
  product_name: string;
  /** The 許可證字號 cell as published; may name several licenses or none. */
  license_text: string | null;
  holder_name: string | null;
  doc_no: string | null;
  /** "YYYY-MM-DD", from the file's own 日期. */
  recalled_on: string | null;
  batch_no: string | null;
  reason: string | null;
  /** Normalized: '1' | '2' | '3' | '未載明'. */
  recall_level: RecallLevel;
  /** The upstream spelling, kept so e.g. 疑似第一級 stays visible. */
  recall_level_raw: string | null;
  /** The one license this recall names when it names exactly one AND that drug is in the drugs table — the UI links to it. Otherwise null. */
  drug_license_no: string | null;
}

/** LIKE pattern that treats the user's `%` and `_` literally. */
const likeContains = (keyword: string): string => `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;

const KEYWORD_WHERE = `(r.product_name LIKE ? OR r.license_text LIKE ? OR r.holder_name LIKE ? OR r.batch_no LIKE ?)`;

export interface RecallFilter {
  keyword: string | null;
  level: RecallLevel | null;
}

const buildWhere = ({ keyword, level }: RecallFilter): { where: string; params: string[] } => {
  const clauses: string[] = [];
  const params: string[] = [];
  if (keyword) {
    const pattern = likeContains(keyword);
    clauses.push(KEYWORD_WHERE);
    params.push(pattern, pattern, pattern, pattern);
  }
  if (level) {
    clauses.push(`r.recall_level = ?`);
    params.push(level);
  }
  return { where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
};

const asLevel = (value: unknown): RecallLevel => (RECALL_LEVELS as readonly string[]).includes(String(value)) ? (String(value) as RecallLevel) : RECALL_LEVEL_UNSPECIFIED;

export const searchDrugRecalls = async (filter: RecallFilter, limit = 30, offset = 0): Promise<DrugRecallListItem[]> =>
  withConnection(async (conn) => {
    const { where, params } = buildWhere(filter);
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT r.id, r.product_name, r.license_text, r.holder_name, r.doc_no,
              DATE_FORMAT(r.recalled_on, '%Y-%m-%d') AS recalled_on,
              r.batch_no, r.reason, r.recall_level, r.recall_level_raw,
              d.license_no AS drug_license_no
       FROM drug_recalls r
       LEFT JOIN (
         SELECT recall_row_key, MIN(license_no) AS license_no
         FROM drug_recall_licenses
         GROUP BY recall_row_key
         HAVING COUNT(*) = 1
       ) sl ON sl.recall_row_key = r.row_key
       LEFT JOIN drugs d ON d.license_no = sl.license_no
       ${where}
       ORDER BY r.recalled_on DESC, r.id ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      product_name: String(r.product_name),
      license_text: r.license_text ?? null,
      holder_name: r.holder_name ?? null,
      doc_no: r.doc_no ?? null,
      recalled_on: r.recalled_on ?? null,
      batch_no: r.batch_no ?? null,
      reason: r.reason ?? null,
      recall_level: asLevel(r.recall_level),
      recall_level_raw: r.recall_level_raw ?? null,
      drug_license_no: r.drug_license_no ?? null,
    }));
  });

/** Row count backing `searchDrugRecalls`'s pagination — same WHERE clause, no LIMIT/OFFSET. */
export const countDrugRecalls = async (filter: RecallFilter): Promise<number> =>
  withConnection(async (conn) => {
    const { where, params } = buildWhere(filter);
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM drug_recalls r ${where}`, params);
    return Number((rows[0] as { total: number }).total);
  });

export interface DrugRecallsMeta {
  /** Rows in the whole table, regardless of any filter. */
  total: number;
  /** Row counts per normalized level — keys are always exactly '1', '2', '3', '未載明'. */
  levelCounts: Record<RecallLevel, number>;
  /** Newest 日期 in the data, "YYYY-MM-DD" (the file's own date, not data.gov.tw's metadata). */
  latestRecalledOn: string | null;
  /** Oldest 日期 in the data. */
  earliestRecalledOn: string | null;
  /** When this site last refreshed the table, ISO 8601 UTC. */
  lastSyncedAt: string | null;
}

export const getDrugRecallsMeta = async (): Promise<DrugRecallsMeta> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              DATE_FORMAT(MAX(recalled_on), '%Y-%m-%d') AS latest_recalled_on,
              DATE_FORMAT(MIN(recalled_on), '%Y-%m-%d') AS earliest_recalled_on,
              MAX(synced_at) AS last_synced_at
       FROM drug_recalls`,
    );
    const [levelRows] = await conn.query<RowDataPacket[]>(`SELECT recall_level, COUNT(*) AS n FROM drug_recalls GROUP BY recall_level`);

    const levelCounts: Record<RecallLevel, number> = { "1": 0, "2": 0, "3": 0, 未載明: 0 };
    for (const lr of levelRows) levelCounts[asLevel(lr.recall_level)] += Number(lr.n);

    const r = rows[0] as Record<string, unknown>;
    const lastSynced = r.last_synced_at instanceof Date ? r.last_synced_at.toISOString() : null;
    return {
      total: Number(r.total ?? 0),
      levelCounts,
      latestRecalledOn: (r.latest_recalled_on as string | null) ?? null,
      earliestRecalledOn: (r.earliest_recalled_on as string | null) ?? null,
      lastSyncedAt: lastSynced,
    };
  });

export interface DrugRecallStatus {
  /** How many recall rows name this license. */
  count: number;
  /** Newest recall date among them, "YYYY-MM-DD". */
  latest_recalled_on: string | null;
  /** The most severe level among them ('1' highest); '未載明' when none states one. */
  worst_level: RecallLevel;
}

/**
 * Which of these licenses were ever named in a recall — used to badge
 * drug-search results with 「曾被回收」. Never throws: a problem with the recall
 * tables (missing table on a half-migrated DB, a transient error) must not take
 * the drug search itself down, so failures log and yield "no badges".
 */
export const getRecallStatusByLicense = async (licenseNos: string[]): Promise<Map<string, DrugRecallStatus>> => {
  const unique = [...new Set(licenseNos.filter(Boolean))];
  if (unique.length === 0) return new Map();

  try {
    return await withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT l.license_no AS license_no,
                COUNT(*) AS recall_count,
                DATE_FORMAT(MAX(r.recalled_on), '%Y-%m-%d') AS latest_recalled_on,
                MIN(CASE r.recall_level WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 ELSE 9 END) AS worst
         FROM drug_recall_licenses l
         JOIN drug_recalls r ON r.row_key = l.recall_row_key
         WHERE l.license_no IN (?)
         GROUP BY l.license_no`,
        [unique],
      );
      const map = new Map<string, DrugRecallStatus>();
      for (const r of rows) {
        const worst = Number(r.worst);
        map.set(String(r.license_no), {
          count: Number(r.recall_count),
          latest_recalled_on: r.latest_recalled_on ?? null,
          worst_level: worst >= 1 && worst <= 3 ? (String(worst) as RecallLevel) : RECALL_LEVEL_UNSPECIFIED,
        });
      }
      return map;
    });
  } catch (error) {
    console.error("getRecallStatusByLicense failed (drug search continues without recall badges):", error);
    return new Map();
  }
};

export interface DrugRecallDetail {
  product_name: string;
  recalled_on: string | null;
  recall_level: RecallLevel;
  recall_level_raw: string | null;
  holder_name: string | null;
  doc_no: string | null;
  batch_no: string | null;
  reason: string | null;
}

/** Newest first; a license is rarely recalled more than a handful of times, 20 is a safety cap for the expanded card. */
const MAX_RECALLS_PER_LICENSE = 20;

/** Recall notices that name one license, newest first — shown in the expanded drug card. Never throws (same reasoning as above). */
export const getRecallsByLicenseNo = async (licenseNo: string): Promise<DrugRecallDetail[]> => {
  try {
    return await withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT r.product_name, DATE_FORMAT(r.recalled_on, '%Y-%m-%d') AS recalled_on, r.recall_level, r.recall_level_raw,
                r.holder_name, r.doc_no, r.batch_no, r.reason
         FROM drug_recall_licenses l
         JOIN drug_recalls r ON r.row_key = l.recall_row_key
         WHERE l.license_no = ?
         ORDER BY r.recalled_on DESC, r.id ASC
         LIMIT ?`,
        [licenseNo, MAX_RECALLS_PER_LICENSE],
      );
      return rows.map((r) => ({
        product_name: String(r.product_name),
        recalled_on: r.recalled_on ?? null,
        recall_level: asLevel(r.recall_level),
        recall_level_raw: r.recall_level_raw ?? null,
        holder_name: r.holder_name ?? null,
        doc_no: r.doc_no ?? null,
        batch_no: r.batch_no ?? null,
        reason: r.reason ?? null,
      }));
    });
  } catch (error) {
    console.error("getRecallsByLicenseNo failed (ingredients lookup continues without it):", error);
    return [];
  }
};
