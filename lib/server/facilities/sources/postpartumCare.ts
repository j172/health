import type { FacilityRecord } from "../queries.ts";
import { parseCsv, toHalfwidthDigits } from "../csv.ts";

// 衛生福利部護理及健康照護司「全國開業護理機構清冊」（含一般護理之家、居家護理所及產後護理之家）
// data.gov.tw 115950，每年/不定期更新。
// 全國涵蓋 1,494 家（產後護理之家 241 家、一般護理之家 501 家、居家護理所 751 家），
// 檔案格式為 UTF-8 CSV（開頭帶 BOM），99.9% 自帶 WGS84 經緯度座標。
export const POSTPARTUM_SOURCE_URL =
  "https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html";

const cleanStr = (v: string | undefined): string => (v ?? "").trim();

const parseBedCount = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(toHalfwidthDigits(v.trim()));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const parseCoord = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = Number(toHalfwidthDigits(v.trim()));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Pure parser for MOHW 115950 CSV text.
 * Filters exclusively for '產後護理之家' institutions, formats bed capacities,
 * extracts evaluation ratings and expiry, and maps WGS84 coordinates.
 */
export function parsePostpartumCareFacilities(text: string): FacilityRecord[] {
  // Strip UTF-8 BOM if present
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows = parseCsv(cleaned);

  const results: FacilityRecord[] = [];

  for (const row of rows) {
    const institutionType = cleanStr(row["機構類別"]);
    const postBeds = parseBedCount(row["產後護理床-開放床數"]);

    // 篩選產後護理機構
    if (institutionType !== "產後護理之家" && postBeds === 0) {
      continue;
    }

    const code = cleanStr(row["機構代碼"]);
    const name = cleanStr(row["機構名稱"]);
    if (!code || !name) {
      continue;
    }

    const city = cleanStr(row["縣市別"]);
    const registeredAddress = cleanStr(row["地址"]);
    const locAddress = cleanStr(row["定位地址"]);
    const address = locAddress || registeredAddress;
    const rawPhone = cleanStr(row["機構電話"]);
    const phone = toHalfwidthDigits(rawPhone).replace(/[－—–]/g, "-").trim();

    const babyBeds = parseBedCount(row["護理類-嬰兒床-開放床數"]);
    const evalResult = cleanStr(row["評鑑結果"]) || "尚未評鑑";
    const evalExpiry = cleanStr(row["合格效期"]);

    const lng = parseCoord(row["WGS84經度"]);
    const lat = parseCoord(row["WGS84緯度"]);

    // 格式化服務項目顯示文字，如「產婦床 18 床 · 嬰兒床 19 床」
    const serviceItems = `產婦床 ${postBeds} 床 · 嬰兒床 ${babyBeds} 床`;

    results.push({
      facilityType: "postpartum_care",
      sourceKey: "nhplatform_115950",
      sourceId: code,
      name,
      address,
      phone,
      lat,
      lng,
      serviceItem: serviceItems,
      serviceTime: null,
      dataOrg: "衛生福利部護理及健康照護司",
      extra: {
        category: evalResult,
        city,
        postpartumBeds: postBeds,
        babyBeds,
        evaluationResult: evalResult,
        evaluationExpiry: evalExpiry || null,
        registeredAddress: registeredAddress || null,
      },
    });
  }

  return results;
}

/**
 * Downloads and parses the live postpartum care facilities from MOHW.
 */
export async function fetchPostpartumCare(): Promise<FacilityRecord[]> {
  const { httpGetText } = await import("../../net/httpClient.ts");
  const { status, text } = await httpGetText(POSTPARTUM_SOURCE_URL, { timeoutMs: 30_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`MOHW 115950 request failed: HTTP ${status}`);
  }

  return parsePostpartumCareFacilities(text);
}
