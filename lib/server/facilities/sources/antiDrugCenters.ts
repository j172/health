import { load } from "cheerio";
import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { TAIWAN_COUNTIES } from "@/lib/constants/taiwanDistricts";

// 反毒大本營（法務部）「各地方毒防中心」靜態列表頁 lp-33-1.html——22 縣市毒品危害
// 防制中心的名稱與地址。這個頁面本身分頁（預設每頁 20 筆，頁尾顯示「共22筆資料，
// 第1/2頁」），但它自己的「每頁顯示」選單提供一個 60 筆/頁的選項
// (<option value="lp-33-1-1-60.html">60</option>)，直接用這個網址一次抓到全部
// 22 筆——2026-10-14 實測確認。比起追蹤「下一頁」連結並發兩次請求簡單，且不依賴
// 猜測的網址格式（60 這個數字是頁面自己提供的選項值，不是憑空湊的）。
//
// 這個頁面沒有電話欄位——表格只有「單位名稱」「地址」「網站」「地圖」四欄，
// 2026-10-14 逐筆核對過，22 筆裡沒有一筆附電話。prompt 原先假設有電話，但實際
// 結構沒有，所以這裡 phone 一律是 null；法務部戒毒成功專線（0800-770-885）已經
// 由 FacilitySearchContent 的 addiction_treatment 固定橫幅處理，不需要在這個
// facilityType 重複。
const SOURCE_URL = "https://antidrug.moj.gov.tw/lp-33-1-1-60.html";

export interface AntiDrugCenterRow {
  name: string | null;
  address: string | null;
}

// Critical-field schema for the *parsed* rows (not raw upstream field names —
// this source is scraped HTML, not CSV/JSON, so there's no column-name
// mapping to guard; what can silently break here is the page's own HTML
// structure — e.g. the #HelpCenter table losing its class/id, or a
// name/address <td> coming back empty for every row). `.nullable()` (not
// `.optional()`) so a column entirely missing/mis-selected across every row
// fails loudly, while a single row's legitimately blank value still passes.
export const antiDrugCenterRowSchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
});

const COUNTY_PATTERN = new RegExp(TAIWAN_COUNTIES.flatMap((c) => [c, c.replace("臺", "台")]).join("|"), "g");

/**
 * Drops a second office's full address glued onto the first with a
 * full-width "、" — the one anomaly found across all 22 real rows
 * (confirmed live 2026-10-14): 臺南市's 地址 cell is literally two offices'
 * full addresses concatenated
 * ("臺南市東區林森路一段418號(林森辦公室)、臺南市新營區東興路163號(東興辦公室)").
 * `normalizeAddress()` (lib/server/facilities/csv.ts) deliberately leaves a
 * bare "、" alone — its own doc comment notes that one far more often just
 * separates multiple house numbers on the *same* street — so without this
 * step the two offices' addresses would be geocoded as one nonsensical
 * string. Detects a second county-name occurrence and truncates before it;
 * a normal single-office address (zero or one county-name match) is
 * returned untouched.
 */
export function stripSecondaryAddress(address: string): string {
  const matches = [...address.matchAll(COUNTY_PATTERN)];
  if (matches.length < 2) return address;
  const secondIndex = matches[1].index;
  if (secondIndex === undefined) return address;
  return address.slice(0, secondIndex).replace(/[、,，]+$/, "").trim();
}

/**
 * Pure HTML parser — takes the page's raw HTML and returns the rows found in
 * its `#HelpCenter` table, with no network I/O of its own, so it can be
 * tested against a recorded fixture (lib/server/facilities/__fixtures__/
 * anti-drug-center-sample.html) rather than the live site.
 */
export function parseAntiDrugCenterHtml(html: string): AntiDrugCenterRow[] {
  const $ = load(html);
  const rows: AntiDrugCenterRow[] = [];

  $("#HelpCenter tbody tr").each((_, el) => {
    const cells = $(el).find("td");
    const name = cells.eq(0).text().trim() || null;
    const address = cells.eq(1).text().trim() || null;
    rows.push({ name, address });
  });

  return rows;
}

export function buildAntiDrugCenterSourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

export async function fetchAntiDrugCenters(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Anti-drug prevention centers (反毒大本營) request failed: HTTP ${status}`);

  const rows = parseAntiDrugCenterHtml(text);
  validateImportRows("Anti-drug prevention centers (反毒大本營)", antiDrugCenterRowSchema, rows);

  return rows
    .filter((r): r is { name: string; address: string } => Boolean(r.name && r.address))
    .map((r) => {
      const address = normalizeAddress(stripSecondaryAddress(r.address));
      return {
        facilityType: "anti_drug_center",
        sourceKey: "anti_drug_center_moj",
        sourceId: buildAntiDrugCenterSourceId(r.name, address),
        name: r.name,
        address,
        phone: null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "法務部（反毒大本營「各地方毒防中心」）",
      };
    });
}
