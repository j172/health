import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import type { WeeklyHoursEntry } from "@/lib/server/facilities/queries";

// 全民健康保險特約院所固定服務時段
// https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21006-001
const SOURCE_URL = "https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21006-001";

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const PERIOD_LABELS = ["上午", "下午", "晚上"];

export async function fetchNhiWeeklyHours(): Promise<WeeklyHoursEntry[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`NHI weekly-hours dataset request failed: HTTP ${status}`);

  const rows = parseCsv(text);
  const entries: WeeklyHoursEntry[] = [];

  for (const row of rows) {
    const sourceId = row["醫事機構代碼"];
    // 21 chars: 1-7 = Mon..Sun morning, 8-14 = Mon..Sun afternoon, 15-21 = Mon..Sun evening.
    // "N" = 開診 (seeing patients), "Y" = 休診 (closed) — per NHI's field documentation.
    const schedule = row["看診星期"];
    if (!sourceId || !schedule || schedule.length !== 21) continue;

    const weeklyHours: Record<string, string[]> = {};
    for (let day = 0; day < 7; day++) {
      const periods: string[] = [];
      for (let period = 0; period < 3; period++) {
        if (schedule[period * 7 + day] === "N") periods.push(PERIOD_LABELS[period]);
      }
      if (periods.length > 0) weeklyHours[DAY_LABELS[day]] = periods;
    }

    if (Object.keys(weeklyHours).length > 0) entries.push({ sourceId, weeklyHours });
  }

  return entries;
}
