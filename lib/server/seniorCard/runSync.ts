import "server-only";
import { getPool } from "@/lib/server/db/mysql";
import { fetchSeniorCard, cityCodeToCounty, SENIOR_CARD_CITIES } from "./tdxClient";

export interface SeniorCardSyncSummary {
  ok: boolean;
  subsidiesUpserted: number;
  errors: string[];
}

/**
 * 迴圈 22 個 SeniorCard City 代碼（tdxClient.ts 的 SENIOR_CARD_CITIES）。
 *
 * issue #729：敬老卡補助改為靜態資料，這個函式不再被任何排程呼叫，只由管理員手動
 * 觸發（POST /api/admin/senior-card-sync）。每個縣市各自 try/catch — 一個縣市的 TDX 呼叫
 * 失敗不會中止其他縣市，該縣市既有的列（種子或先前同步寫入的）原封不動、不會被清掉。
 * 縣市成功時，舊列在同一批 DELETE+INSERT 中被取代，因為 Subsidies[] 沒有天然的逐列 key
 * （DELETE WHERE county=? 再整批 INSERT）。一次手動執行約 22 個 TDX 請求（走共用限流器）。
 */
export async function runSeniorCardSync(): Promise<SeniorCardSyncSummary> {
  const summary: SeniorCardSyncSummary = { ok: true, subsidiesUpserted: 0, errors: [] };

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  // 一次 3 個縣市，沿用其他 TDX client 的 batchSize=3 對 TDX 每分鐘限流的節流。
  const batchSize = 3;
  for (let i = 0; i < SENIOR_CARD_CITIES.length; i += batchSize) {
    const batch = SENIOR_CARD_CITIES.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (cityCode) => {
        const county = cityCodeToCounty(cityCode) || cityCode;
        try {
          const entries = await fetchSeniorCard(cityCode);
          if (entries.length === 0) return;

          await pool.query("DELETE FROM senior_card_subsidies WHERE county = ?", [county]);
          for (const entry of entries) {
            const subsidies = entry.Subsidies && entry.Subsidies.length > 0 ? entry.Subsidies : [{ Category: null, Description: null }];
            for (const subsidy of subsidies) {
              await pool.query(
                `INSERT INTO senior_card_subsidies
                  (county, card_name, info_url, category, description)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                  county,
                  entry.SeniorCardName || entry.AutorityName || null,
                  entry.URL || null,
                  subsidy.Category || null,
                  subsidy.Description || null,
                ],
              );
              summary.subsidiesUpserted += 1;
            }
          }
        } catch (err) {
          summary.errors.push(`${cityCode} (${county}) fetch/upsert failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );
  }

  return summary;
}
