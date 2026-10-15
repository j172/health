import type { RowDataPacket } from "mysql2/promise";
import { withConnectionFallback } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { PoliceFraudInterdictionRecord } from "@/lib/server/antiFraud/sources/police172159";
import type { FscFraudAdStatsRecord } from "@/lib/server/antiFraud/sources/fsc11198";

/**
 * DB access for issue #570's "最新詐騙趨勢" section — three independent
 * pieces, each queried separately and each tolerant of its own absence (a
 * fresh DB before the first sync has run, or any other DB hiccup) via
 * `withConnectionFallback`, so one missing piece never blanks out the whole
 * trends section:
 *   1. Monthly new-domain counts + this month's site-nature distribution,
 *      aggregated straight from `fraud_domains` (no new table — #570's own
 *      acceptance criteria call for this to come from that existing table).
 *   2. 172159's monthly police interdiction stats (its own small table).
 *   3. 11198's weekly FSC fraud-ad stats (its own small table).
 */

export interface FraudDomainsMonthlyCount {
  /** Raw 民國年月 string as stored, e.g. "11509". */
  yearMonth: string;
  domainCount: number;
}

export interface FraudDomainsSiteNatureCount {
  siteNature: string;
  domainCount: number;
}

export interface FraudDomainsTrendSummary {
  /** Most recent 民國年月 present in `fraud_domains`, or null if the table is empty. */
  latestYearMonth: string | null;
  /** Most recent N year-months (newest first), each with how many domains' most-recently-synced report_year_month falls in it. */
  monthlyCounts: FraudDomainsMonthlyCount[];
  /** Site-nature breakdown for domains whose report_year_month is the latest one. */
  siteNatureDistribution: FraudDomainsSiteNatureCount[];
}

/**
 * Aggregates "本月新增停止解析網域數" and "本月網站性質分布" directly from
 * `fraud_domains`. `report_year_month` is a plain field there (deliberately
 * NOT part of that table's UNIQUE KEY — see schema.ts's comment on
 * `fraudDomains`), overwritten to each domain's most-recently-synced value
 * on every re-sync. Grouping by it therefore approximates "which domains'
 * latest-known report batch is month X" rather than true first-seen-month
 * history, which is exactly what issue #570's acceptance criterion asks
 * for ("每月新增停止解析網域數...都從涉詐網域表彙總").
 */
export const getFraudDomainsTrendSummary = async (
  monthsBack = 6,
): Promise<FraudDomainsTrendSummary> =>
  withConnectionFallback(
    { latestYearMonth: null, monthlyCounts: [], siteNatureDistribution: [] },
    async (conn) => {
      const [latestRows] = await conn.query<RowDataPacket[]>(
        `SELECT MAX(report_year_month) AS latest FROM fraud_domains WHERE report_year_month IS NOT NULL`,
      );
      const latestYearMonth: string | null = latestRows[0]?.latest ?? null;
      if (!latestYearMonth) {
        return { latestYearMonth: null, monthlyCounts: [], siteNatureDistribution: [] };
      }

      const [monthlyRows] = await conn.query<RowDataPacket[]>(
        `
        SELECT report_year_month AS yearMonth, COUNT(DISTINCT domain) AS domainCount
        FROM fraud_domains
        WHERE report_year_month IS NOT NULL
        GROUP BY report_year_month
        ORDER BY report_year_month DESC
        LIMIT ?
        `,
        [monthsBack],
      );

      const [natureRows] = await conn.query<RowDataPacket[]>(
        `
        SELECT COALESCE(site_nature, '未標註') AS siteNature, COUNT(DISTINCT domain) AS domainCount
        FROM fraud_domains
        WHERE report_year_month = ?
        GROUP BY siteNature
        ORDER BY domainCount DESC
        `,
        [latestYearMonth],
      );

      return {
        latestYearMonth,
        monthlyCounts: monthlyRows.map((r) => ({
          yearMonth: String(r.yearMonth),
          domainCount: Number(r.domainCount),
        })),
        siteNatureDistribution: natureRows.map((r) => ({
          siteNature: String(r.siteNature),
          domainCount: Number(r.domainCount),
        })),
      };
    },
  );

/**
 * Upserts a batch of 172159 monthly interdiction-stats records, keyed by
 * (roc_year, roc_month) — see schema.ts's comment on
 * `policeFraudInterdictionStats` for why, unlike `fraud_domains`, the time
 * columns belong IN this table's UNIQUE KEY: each row here is a genuine
 * historical monthly snapshot, not a "latest state" that should be
 * overwritten away. Re-syncing an already-stored month still safely
 * UPDATEs it in place (upstream occasionally revises a recent month's
 * figures slightly after first publishing it).
 */
export const upsertPoliceFraudInterdictionStats = async (
  records: PoliceFraudInterdictionRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO police_fraud_interdiction_stats
      (roc_year, roc_month, gang_count, member_count, seized_amount_ntd, blocked_amount_ntd, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      gang_count = VALUES(gang_count),
      member_count = VALUES(member_count),
      seized_amount_ntd = VALUES(seized_amount_ntd),
      blocked_amount_ntd = VALUES(blocked_amount_ntd),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.rocYear,
      r.rocMonth,
      r.gangCount,
      r.memberCount,
      r.seizedAmountNtd,
      r.blockedAmountNtd,
      now,
      now,
      now,
    ],
  );
};

export interface PoliceFraudInterdictionStatsRow {
  rocYear: number;
  rocMonth: number;
  gangCount: number | null;
  memberCount: number | null;
  seizedAmountNtd: number | null;
  blockedAmountNtd: number | null;
}

/** Most recent `limit` months, newest first — for display on /tools/anti-fraud. */
export const getLatestPoliceFraudInterdictionStats = async (
  limit = 6,
): Promise<PoliceFraudInterdictionStatsRow[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT roc_year, roc_month, gang_count, member_count, seized_amount_ntd, blocked_amount_ntd
      FROM police_fraud_interdiction_stats
      ORDER BY roc_year DESC, roc_month DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows.map((r) => ({
      rocYear: Number(r.roc_year),
      rocMonth: Number(r.roc_month),
      gangCount: r.gang_count === null ? null : Number(r.gang_count),
      memberCount: r.member_count === null ? null : Number(r.member_count),
      seizedAmountNtd: r.seized_amount_ntd === null ? null : Number(r.seized_amount_ntd),
      blockedAmountNtd: r.blocked_amount_ntd === null ? null : Number(r.blocked_amount_ntd),
    }));
  });

/**
 * Upserts a batch of 11198 weekly fraud-ad-stats records, keyed by
 * report_date — same "this time column belongs in the key, this is a real
 * time series" reasoning as `upsertPoliceFraudInterdictionStats` above (see
 * schema.ts's comment on `fscFraudAdStats`).
 */
export const upsertFscFraudAdStats = async (
  records: FscFraudAdStatsRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO fsc_fraud_ad_stats
      (report_date, weekly_new_count, change_pct, cumulative_count, synced_at, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      weekly_new_count = VALUES(weekly_new_count),
      change_pct = VALUES(change_pct),
      cumulative_count = VALUES(cumulative_count),
      synced_at = VALUES(synced_at),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [r.reportDate, r.weeklyNewCount, r.changePct, r.cumulativeCount, now, now, now],
  );
};

export interface FscFraudAdStatsRow {
  reportDate: string;
  weeklyNewCount: number | null;
  changePct: number | null;
  cumulativeCount: number | null;
}

/** Most recent `limit` weeks, newest first — for display on /tools/anti-fraud. */
export const getLatestFscFraudAdStats = async (
  limit = 8,
): Promise<FscFraudAdStatsRow[]> =>
  withConnectionFallback([], async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `
      SELECT report_date, weekly_new_count, change_pct, cumulative_count
      FROM fsc_fraud_ad_stats
      ORDER BY report_date DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows.map((r) => ({
      reportDate:
        r.report_date instanceof Date
          ? r.report_date.toISOString().slice(0, 10)
          : String(r.report_date),
      weeklyNewCount: r.weekly_new_count === null ? null : Number(r.weekly_new_count),
      changePct: r.change_pct === null ? null : Number(r.change_pct),
      cumulativeCount: r.cumulative_count === null ? null : Number(r.cumulative_count),
    }));
  });
