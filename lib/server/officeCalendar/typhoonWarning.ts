import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { memoizeQuery } from "@/lib/server/cache/memo";

/**
 * Is a Central Weather Administration typhoon warning in force? (issue #691)
 *
 * Used for ONE purpose: to tell a visitor "a typhoon warning is out — go and
 * read the official 停班停課 announcement". It is not, and must never be shown
 * as, a closure: which counties stop work and school is decided by each
 * county government and published by 行政院人事行政總處, and this site has no
 * machine-readable access to that (see lib/tools/workSchoolStatus/closureGuidance.ts).
 *
 * Reads `cwa_alerts` rows of dataset W-C0034-001 (颱風警報, CAP), which the
 * existing CWA sync already writes (lib/server/cwa/sources/alerts.ts), with the
 * same "in force" rule listActiveCwaAlerts applies: the row's own `expires`,
 * or a 7-day window from `effective` only when CWA omitted one. Not the
 * W-C0034-005 cyclone *track* rows (listActiveCwaTyphoons) — a typhoon
 * somewhere in the Pacific with no warning for Taiwan must not light this up.
 *
 * Returns `null` when the database could not answer, so callers show nothing
 * rather than "no warning". Cached for 60 seconds.
 */
export const TYPHOON_WARNING_DATASET_ID = "W-C0034-001";

/**
 * The "in force" predicate on `cwa_alerts` — one definition shared by the
 * yes/no check below and the level-aware status (lib/server/typhoon/status.ts,
 * issue #744), so the two can never disagree about whether a warning is active.
 * Bind `TYPHOON_WARNING_DATASET_ID` to its single placeholder.
 */
export const TYPHOON_WARNING_IN_FORCE_SQL = `
  dataset_id = ?
  AND (
    CASE
      WHEN expires IS NOT NULL THEN expires > UTC_TIMESTAMP()
      ELSE COALESCE(effective, synced_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
    END
  )
`;

export const isTyphoonWarningActive = async (): Promise<boolean | null> => {
  try {
    return await memoizeQuery(
      "office_calendar_typhoon_warning_active",
      () =>
        withConnection(async (conn) => {
          const [rows] = await conn.query<RowDataPacket[]>(
            `
            SELECT COUNT(*) AS cnt
            FROM cwa_alerts
            WHERE ${TYPHOON_WARNING_IN_FORCE_SQL}
            `,
            [TYPHOON_WARNING_DATASET_ID],
          );
          return Number(rows[0]?.cnt ?? 0) > 0;
        }),
      60,
    );
  } catch (error) {
    console.warn("[officeCalendar] Could not read the active typhoon warning state:", error);
    return null;
  }
};
