import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import { memoizeQuery } from "@/lib/server/cache/memo";
import { buildEarthquakeStatus, EARTHQUAKE_BANNER_WINDOW_HOURS, type EarthquakeRow, type EarthquakeStatus } from "@/lib/earthquake/earthquakeStatus";

/**
 * 地震速報橫幅狀態（比照颱風警報橫幅 issue #744 的 lib/server/typhoon/status.ts）。
 *
 * 和颱風那套最大的不同：颱風查「現在生效中」的警報（effective/expires 還沒過期），地震沒有
 * 「生效中」這種狀態，所以這裡直接用 origin_time 做時間視窗的 SQL 篩選（固定抓最近
 * EARTHQUAKE_BANNER_WINDOW_HOURS 小時內的列），精確的「是否仍在 72 小時視窗內」與「有感判定」
 * 則交給純函式 buildEarthquakeStatus 做（可單獨測試、可注入 now）。這裡的 SQL 條件只是粗篩，
 * 真正的 active 判斷不依賴 SQL 篩出的筆數，而是純函式重新算一次。
 *
 * 只讀 cwa_earthquakes（CWA 地震報告 E-A0015-001），不是 global_earthquakes 等多來源合併表 —
 * 這個橫幅只關心「CWA 有沒有發布有感地震報告」，與全球地震地圖（/tools/global-watch/earthquakes）
 * 用的多來源合併資料是兩件事。
 *
 * Returns `null` when the database could not answer — the route turns that into
 * `{ active: false }` with a SHORT cache lifetime, and the banner shows nothing.
 * 60-second in-process cache, like the typhoon status.
 */
export const loadEarthquakeStatus = async (): Promise<EarthquakeStatus | null> => {
  try {
    return await memoizeQuery(
      "earthquake_status_banner",
      () =>
        withConnection(async (conn) => {
          const [rows] = await conn.query<RowDataPacket[]>(
            `
            SELECT earthquake_no, origin_time, location, magnitude_value, max_intensity, area_intensity_json
            FROM cwa_earthquakes
            WHERE origin_time IS NOT NULL
              AND origin_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? HOUR)
              AND area_intensity_json IS NOT NULL
            ORDER BY origin_time DESC
            LIMIT 50
            `,
            [EARTHQUAKE_BANNER_WINDOW_HOURS],
          );
          return buildEarthquakeStatus(rows as unknown as EarthquakeRow[]);
        }),
      60,
    );
  } catch (error) {
    console.warn("[earthquake] Could not read the earthquake status:", error);
    return null;
  }
};
