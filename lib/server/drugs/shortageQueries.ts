import type { RowDataPacket } from "mysql2/promise";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import { decideSnapshotReconcile } from "@/lib/server/drugs/shortageSnapshot";
import type { DrugShortageRecord, DrugShortageSource } from "@/lib/server/drugs/sources/tfdaDrugShortages";

/** Rows per round-trip: supply_status runs to ~1 KB per row, so keep chunks modest. */
const UPSERT_BATCH_SIZE = 100;

export interface DrugShortageSnapshotResult {
  inserted: number;
  updated: number;
  deleted: number;
  /** Why the stale-row delete was skipped, or null when it ran (or had nothing to do). Surfaced to ingest_errors by the runner. */
  reconcileSkippedReason: string | null;
}

/**
 * Applies one dataset's fresh snapshot to drug_shortages: upsert every row by
 * row_key, then — only if the snapshot looks plausibly complete (see
 * decideSnapshotReconcile) — remove this source's rows that this run did not
 * refresh, i.e. shortages the upstream no longer lists.
 *
 * "Did not refresh" is `synced_at < <this run's timestamp>`: every row the
 * upsert touches is stamped with that timestamp, so older stamps are exactly
 * the rows missing from the snapshot. Scoped by source_key so 54504 and 54505
 * reconcile independently.
 */
export const replaceDrugShortagesSnapshot = async (
  source: DrugShortageSource,
  records: DrugShortageRecord[],
  noDataPlaceholder: boolean,
): Promise<DrugShortageSnapshotResult> =>
  withConnection(async (conn) => {
    const [countRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM drug_shortages WHERE source_key = ?`,
      [source.sourceKey],
    );
    const existing = Number((countRows[0] as { total: number }).total);

    const syncedAt = utcNowSql();
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + UPSERT_BATCH_SIZE);
      const values = chunk.map((r) => [
        r.sourceKey,
        r.rowKey,
        r.hasAlternative ? 1 : 0,
        r.licenseNo,
        r.nameZh,
        r.nameEn,
        r.announcedOn,
        r.supplyStatus,
        syncedAt,
        syncedAt,
        syncedAt,
      ]);
      const [result] = await conn.query(
        `
        INSERT INTO drug_shortages
          (source_key, row_key, has_alternative, license_no, name_zh, name_en, announced_on, supply_status, synced_at, created_at, updated_at)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          has_alternative = VALUES(has_alternative),
          license_no = VALUES(license_no),
          name_zh = VALUES(name_zh),
          name_en = VALUES(name_en),
          announced_on = VALUES(announced_on),
          supply_status = VALUES(supply_status),
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
    }

    const decision = decideSnapshotReconcile({ fetched: records.length, existing, noDataPlaceholder });
    if (!decision.reconcile) {
      return { inserted, updated, deleted: 0, reconcileSkippedReason: decision.reason };
    }

    const [deleteResult] = await conn.query(
      `DELETE FROM drug_shortages WHERE source_key = ? AND synced_at < ?`,
      [source.sourceKey, syncedAt],
    );
    const deleted = (deleteResult as { affectedRows: number }).affectedRows;
    return { inserted, updated, deleted, reconcileSkippedReason: null };
  });

export interface DrugShortageListItem {
  id: number;
  license_no: string;
  name_zh: string;
  name_en: string | null;
  /** true = 54504 (經評估有替代藥品), false = 54505 (經評估無替代藥品). */
  has_alternative: boolean;
  /** "YYYY-MM-DD", from the file's own 公告更新時間. */
  announced_on: string | null;
  supply_status: string | null;
  /** The license also exists in the drugs (appearance) table, so the UI can offer a link to it. */
  in_drugs: boolean;
}

/** LIKE pattern that treats the user's `%` and `_` literally. */
const likeContains = (keyword: string): string => `%${keyword.replace(/[\\%_]/g, "\\$&")}%`;

const KEYWORD_WHERE = `(s.name_zh LIKE ? OR s.name_en LIKE ? OR s.license_no LIKE ?)`;

export const searchDrugShortages = async (keyword: string | null, limit = 30, offset = 0): Promise<DrugShortageListItem[]> =>
  withConnection(async (conn) => {
    const params: Array<string | number> = [];
    let where = "";
    if (keyword) {
      const pattern = likeContains(keyword);
      where = `WHERE ${KEYWORD_WHERE}`;
      params.push(pattern, pattern, pattern);
    }
    params.push(limit, offset);

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT s.id, s.license_no, s.name_zh, s.name_en, s.has_alternative,
              DATE_FORMAT(s.announced_on, '%Y-%m-%d') AS announced_on,
              s.supply_status,
              (d.id IS NOT NULL) AS in_drugs
       FROM drug_shortages s
       LEFT JOIN drugs d ON d.license_no = s.license_no
       ${where}
       ORDER BY s.announced_on DESC, s.id ASC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map((r) => ({
      id: Number(r.id),
      license_no: String(r.license_no),
      name_zh: String(r.name_zh),
      name_en: r.name_en ?? null,
      has_alternative: Boolean(Number(r.has_alternative)),
      announced_on: r.announced_on ?? null,
      supply_status: r.supply_status ?? null,
      in_drugs: Boolean(Number(r.in_drugs)),
    }));
  });

/** Row count backing `searchDrugShortages`'s pagination — same WHERE clause, no LIMIT/OFFSET. */
export const countDrugShortages = async (keyword: string | null): Promise<number> =>
  withConnection(async (conn) => {
    const params: string[] = [];
    let where = "";
    if (keyword) {
      const pattern = likeContains(keyword);
      where = `WHERE ${KEYWORD_WHERE}`;
      params.push(pattern, pattern, pattern);
    }
    const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM drug_shortages s ${where}`, params);
    return Number((rows[0] as { total: number }).total);
  });

export interface DrugShortagesMeta {
  /** Rows in the whole table, regardless of any keyword filter. */
  total: number;
  /** Rows from 54505 (經評估無替代藥品); 0 today. */
  withoutAlternativeCount: number;
  /** Newest 公告更新時間 in the data, "YYYY-MM-DD" (the file's own date, not data.gov.tw's metadata). */
  latestAnnouncedOn: string | null;
  /** When this site last refreshed the table, ISO 8601 UTC. */
  lastSyncedAt: string | null;
}

export const getDrugShortagesMeta = async (): Promise<DrugShortagesMeta> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(has_alternative = 0), 0) AS without_alternative,
              DATE_FORMAT(MAX(announced_on), '%Y-%m-%d') AS latest_announced_on,
              MAX(synced_at) AS last_synced_at
       FROM drug_shortages`,
    );
    const r = rows[0] as Record<string, unknown>;
    const lastSynced = r.last_synced_at instanceof Date ? r.last_synced_at.toISOString() : null;
    return {
      total: Number(r.total ?? 0),
      withoutAlternativeCount: Number(r.without_alternative ?? 0),
      latestAnnouncedOn: (r.latest_announced_on as string | null) ?? null,
      lastSyncedAt: lastSynced,
    };
  });

export type DrugShortageStatus = "with_alternative" | "no_alternative";

/**
 * Which of these licenses are currently on a shortage list — used to badge
 * drug-search results. Never throws: a problem with the shortage table
 * (missing table on a half-migrated DB, a transient error) must not take the
 * drug search itself down, so failures log and yield "no badges".
 */
export const getShortageStatusByLicense = async (licenseNos: string[]): Promise<Map<string, DrugShortageStatus>> => {
  const unique = [...new Set(licenseNos.filter(Boolean))];
  if (unique.length === 0) return new Map();

  try {
    return await withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT license_no, MIN(has_alternative) AS min_alternative
         FROM drug_shortages
         WHERE license_no IN (?)
         GROUP BY license_no`,
        [unique],
      );
      const map = new Map<string, DrugShortageStatus>();
      for (const r of rows) {
        // Listed in 54505 (no alternative) anywhere => the more serious status wins.
        map.set(String(r.license_no), Number(r.min_alternative) === 0 ? "no_alternative" : "with_alternative");
      }
      return map;
    });
  } catch (error) {
    console.error("getShortageStatusByLicense failed (drug search continues without shortage badges):", error);
    return new Map();
  }
};

export interface DrugShortageDetail {
  has_alternative: boolean;
  announced_on: string | null;
  supply_status: string | null;
}

/** Shortage notices for one license, newest first — shown in the expanded drug card. Never throws (same reasoning as above). */
export const getShortagesByLicenseNo = async (licenseNo: string): Promise<DrugShortageDetail[]> => {
  try {
    return await withConnection(async (conn) => {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT has_alternative, DATE_FORMAT(announced_on, '%Y-%m-%d') AS announced_on, supply_status
         FROM drug_shortages
         WHERE license_no = ?
         ORDER BY announced_on DESC, id ASC`,
        [licenseNo],
      );
      return rows.map((r) => ({
        has_alternative: Boolean(Number(r.has_alternative)),
        announced_on: r.announced_on ?? null,
        supply_status: r.supply_status ?? null,
      }));
    });
  } catch (error) {
    console.error("getShortagesByLicenseNo failed (ingredients lookup continues without it):", error);
    return [];
  }
};
