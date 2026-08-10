import { httpGetText } from "@/lib/server/net/httpClient";
import type { WraDroughtAlertRecord } from "@/lib/server/wra/queries";

// 經濟部水利署 (WRA) 枯旱限水通報 — opendata.wra.gov.tw, historical log back to
// 2012. Not CAP format (unlike lib/server/cwa/sources/alerts.ts) and carries
// no effective/expires fields, just a report date per reservoir — see
// docs/specs/phase5-wra-drought-alerts.md section 1.
const WRA_DROUGHT_ALERTS_URL =
  "https://opendata.wra.gov.tw/api/v2/51ea7202-18fd-46e3-adae-4d05bc827a28?sort=_importdate%20asc&format=JSON";

interface RawWraDroughtRecord {
  通報日期?: string;
  預警水情?: string;
  水庫名稱?: string;
  供水區?: string;
  標題?: string;
}

export async function fetchWraDroughtAlerts(): Promise<WraDroughtAlertRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs on
  // this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(WRA_DROUGHT_ALERTS_URL);
  if (status < 200 || status >= 300) throw new Error(`WRA drought alerts request failed: HTTP ${status}`);

  const raw = JSON.parse(text) as unknown;
  if (!Array.isArray(raw)) throw new Error("WRA drought alerts response was not an array");

  return (raw as RawWraDroughtRecord[])
    .map((r): WraDroughtAlertRecord | null => {
      const reportDate = (r.通報日期 ?? "").trim();
      const reservoirName = (r.水庫名稱 ?? "").trim();
      const title = (r.標題 ?? "").trim();
      // A handful of historical rows are WRA's own test bulletins with a
      // blank 水庫名稱 (confirmed live, e.g. "...(測試)-台南") — they have no
      // stable per-reservoir identity to key news_items on, so skip them
      // rather than let them collide with each other under an empty key.
      if (!reportDate || !reservoirName || !title) return null;
      return {
        reportDate,
        alertLevel: r.預警水情?.trim() || null,
        reservoirName,
        supplyArea: r.供水區?.trim() || null,
        title,
      };
    })
    .filter((r): r is WraDroughtAlertRecord => r !== null);
}
