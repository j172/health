import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { chunkedUpsert } from "@/lib/server/db/chunkedUpsert";
import type { FraudDomainRecord } from "@/lib/server/antiFraud/sources/police176455";
import type { DomainHit } from "@/lib/server/antiFraud/checkSuspiciousUrl";

/**
 * Upserts a batch of fraud-domain records keyed by (domain, source) —
 * matches `fraud_domains`'s UNIQUE KEY in schema.ts. `first_seen` is only
 * ever written on the initial INSERT — it's deliberately left out of the
 * `ON DUPLICATE KEY UPDATE` clause below, so MySQL leaves the original
 * stored value untouched on every later re-sync of the same (domain,
 * source) row. `last_seen` and the display fields do get refreshed on every
 * sync, so a domain still being reported shows when it was most recently
 * seen. Chunked via the same `chunkedUpsert` helper `upsertFacilities` uses
 * — this source alone runs to ~93,840 rows, so one round-trip per row
 * doesn't scale.
 */
export const upsertFraudDomains = async (
  records: FraudDomainRecord[],
): Promise<{ inserted: number; updated: number }> => {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  return chunkedUpsert(
    records,
    `
    INSERT INTO fraud_domains
      (domain, source, site_nature, legal_basis, applicant_org, report_year_month, fraud_description, first_seen, last_seen, created_at, updated_at)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      site_nature = VALUES(site_nature),
      legal_basis = VALUES(legal_basis),
      applicant_org = VALUES(applicant_org),
      report_year_month = VALUES(report_year_month),
      fraud_description = VALUES(fraud_description),
      last_seen = VALUES(last_seen),
      updated_at = VALUES(updated_at)
    `,
    (r, now) => [
      r.domain,
      r.source,
      r.siteNature,
      r.legalBasis,
      r.applicantOrg,
      r.reportedYearMonth,
      r.fraudDescription,
      now,
      now,
      now,
      now,
    ],
  );
};

/**
 * The production `findDomains` implementation `checkSuspiciousUrl` is
 * wired up with: an exact-match lookup of every candidate host against
 * `fraud_domains.domain`. Intentionally does not log `candidates` — those
 * are derived straight from the user's pasted URL, and issue #564's privacy
 * promise is that no query a visitor makes is ever recorded anywhere,
 * including here.
 */
export const findFraudDomainsByHosts = async (
  candidates: string[],
): Promise<DomainHit[]> => {
  if (candidates.length === 0) return [];

  return withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT domain, source, site_nature, report_year_month, fraud_description FROM fraud_domains WHERE domain IN (?)`,
      [candidates],
    );
    return rows.map((row) => ({
      domain: row.domain,
      source: row.source,
      siteNature: row.site_nature,
      reportedYearMonth: row.report_year_month,
      fraudDescription: row.fraud_description,
    }));
  });
};

/**
 * Most recent `last_seen` across the whole table — surfaced on
 * `/tools/anti-fraud` as "清單最後更新日期" (issue #564 AC). `null` before
 * the first sync has ever run (e.g. a fresh DB).
 */
export const getFraudDomainsLastSyncedAt = async (): Promise<Date | null> =>
  withConnection(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT MAX(last_seen) AS last_seen FROM fraud_domains`,
    );
    const value = rows[0]?.last_seen;
    return value ? new Date(value) : null;
  });
