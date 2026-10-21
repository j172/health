import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { memoizeQuery } from "@/lib/server/cache/memo";
import { TYPHOON_WARNING_DATASET_ID, TYPHOON_WARNING_IN_FORCE_SQL } from "@/lib/server/officeCalendar/typhoonWarning";
import { listActiveCwaTyphoons } from "@/lib/server/cwa/queries";
import { buildTyphoonStatus, pickTyphoonNames, type TyphoonStatus, type TyphoonWarningRow } from "@/lib/typhoon/typhoonStatus";

/**
 * Level-aware typhoon-warning status for the site-wide banner (issue #744).
 *
 * Same dataset (W-C0034-001) and the same "in force" predicate as
 * isTyphoonWarningActive (lib/server/officeCalendar/typhoonWarning.ts), but it
 * also reads event/headline so the pure classifier can tell 海上 from 陸上.
 *
 * Returns `null` when the database could not answer — the route turns that into
 * `{ active: false }` with a SHORT cache lifetime, and the banner shows nothing.
 * 60-second in-process cache, like the yes/no check.
 */
export const loadTyphoonStatus = async (): Promise<TyphoonStatus | null> => {
  try {
    return await memoizeQuery(
      "typhoon_status_banner",
      async () => {
        const status = await withConnection(async (conn) => {
          const [rows] = await conn.query<RowDataPacket[]>(
            `
            SELECT event, headline, effective, synced_at
            FROM cwa_alerts
            WHERE ${TYPHOON_WARNING_IN_FORCE_SQL}
            ORDER BY effective DESC
            LIMIT 50
            `,
            [TYPHOON_WARNING_DATASET_ID],
          );
          return buildTyphoonStatus(rows as unknown as TyphoonWarningRow[]);
        });
        // 颱風名稱來自颱風動態（W-C0034-005，已在線上驗證）；警報本身的欄位格式尚未有真實樣本。
        // listActiveCwaTyphoons 自己吞掉錯誤並回 []，所以拿不到名稱只會少一行字，不影響橫幅。
        if (status.active) {
          const names = pickTyphoonNames((await listActiveCwaTyphoons()).map((row) => row.event));
          if (names.length > 0) status.names = names;
        }
        return status;
      },
      60,
    );
  } catch (error) {
    console.warn("[typhoon] Could not read the typhoon warning status:", error);
    return null;
  }
};
