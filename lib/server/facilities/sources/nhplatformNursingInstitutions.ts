import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 115950「全國開業護理機構清冊（含一般護理之家、居家護理所及產後護理
// 之家）」— 衛福部護理及健康照護司，CSV，UTF-8 with BOM，~1,494 筆，自帶 WGS84
// 經緯度（不需 geocode）。單一資料集混了三種機構類別，拆成兩個目的地：
//   - 機構類別 === "產後護理之家"（241 筆）→ 新 facilityType "postpartum_care"
//   - 機構類別 === "一般護理之家" / "居家護理所" → 併入既有 facilityType
//     "long_term_care"，service_item 直接存機構類別字串（沿用 facilityConfigs.ts
//     既有「categories 值直接比對 service_item」的篩選慣例），extra.category
//     同步記一份供卡片顯示用。
//
// 下載網址是 data.gov.tw dataset API（https://data.gov.tw/api/v2/rest/dataset/115950）
// 回傳的 resourceDownloadUrl，實測於 2026-10-14 從本次開發所在環境直接 curl 成功
// （HTTP 200、無轉址、回傳 348KB 真實 CSV，檔名 114年12月全國開業護理機構清冊.csv）。
// 但這個環境不是正式主機也不是 GitHub Actions runner —
// nhplatform.mohw.gov.tw 是否真的能從正式主機連線**仍未驗證**，已加入
// .github/workflows/egress-probe.yml 兩側探測；部署後第一次排程跑之前，務必跑一次
// 該 workflow（或 `node scripts/gha-egress-probe-host.mjs`）確認正式主機連得到，
// 連不到才需要建 GitHub runner relay。這個 dl-3820 網址本身是 nhplatform 的資源
// permalink（資料每年更新一次時，平台慣例是同網址覆蓋新檔，不是每次換新 hash），
// 所以像其他來源一樣直接 pin 住，不每次呼叫 dataset API 多繞一次。
const SOURCE_URL = "https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html";

interface NhplatformNursingRow {
  機構代碼: string;
  縣市別: string;
  機構名稱: string;
  "一般護理之家-開放床數": string;
  "產後護理床-開放床數": string;
  "護理類-嬰兒床-開放床數": string;
  機構電話: string;
  機構類別: string;
  地址: string;
  評鑑結果: string;
  合格效期: string;
  定位地址: string;
  WGS84經度: string;
  WGS84緯度: string;
}

// Critical-field schema for the raw rows. 機構代碼/機構名稱/地址 are
// identity-bearing (sourceId depends on all three); 機構類別 is what routes
// a row to postpartum_care vs long_term_care; WGS84經度/WGS84緯度 are this
// dataset's whole reason for skipping the geocode backfill. `.nullable()`
// (not `.optional()`) so a column entirely missing from every row
// (renamed/removed upstream) fails validation loudly, while one row's
// legitimately blank value (confirmed live: 158/1494 rows have an empty
// 合格效期 — institutions that are "尚未評鑑" or "不合格") still passes.
export const nhplatformNursingRawSchema = z.object({
  機構代碼: z.string().nullable(),
  機構名稱: z.string().nullable(),
  機構類別: z.string().nullable(),
  地址: z.string().nullable(),
  WGS84經度: z.string().nullable(),
  WGS84緯度: z.string().nullable(),
  評鑑結果: z.string().nullable(),
  合格效期: z.string().nullable(),
});

export const POSTPARTUM_CARE_CATEGORY = "產後護理之家";
export const LONG_TERM_CARE_MERGED_CATEGORIES = ["一般護理之家", "居家護理所"] as const;

/**
 * Converts this dataset's Chinese Minguo date format (e.g. "118年12月31日")
 * to ISO YYYY-MM-DD. Distinct from `minguoToIsoDate` in nhiPenalties.ts,
 * which handles the packed-digit format ("1180101") NHI's penalty CSVs use —
 * this source's 合格效期 column is a different shape entirely. Returns null
 * for blank/unparseable values (158/1494 rows: institutions "尚未評鑑" or
 * "不合格" leave this column empty).
 */
export function parseRocDateToIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2,3})年(\d{1,2})月(\d{1,2})日$/);
  if (!m) return null;
  const year = parseInt(m[1], 10) + 1911;
  const month = m[2].padStart(2, "0");
  const day = m[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toBedCount(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function buildNhplatformSourceId(code: string, name: string, address: string): string {
  return `${code.trim()}|${name.trim()}|${address.trim()}`.slice(0, 100);
}

function toCoord(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.trim());
  return Number.isFinite(n) ? n : null;
}

const DATA_ORG = "衛生福利部護理及健康照護司（data.gov.tw 115950）";

/**
 * Maps one raw CSV row to 0 or 1 `FacilityRecord`, routing by 機構類別:
 * postpartum_care for 產後護理之家, long_term_care (with service_item/
 * extra.category set to the Chinese category string, matching this
 * dataset's two other categories into facilityConfigs.ts's existing
 * "categories value == service_item substring" filter pattern) for
 * 一般護理之家/居家護理所, and skipped for any other value — pulled out of
 * `fetchNhplatformNursingInstitutions` as a pure function so the
 * category-routing/evaluations/bed-count logic is unit-testable without
 * mocking HTTP.
 */
export function mapRowToFacilityRecord(r: NhplatformNursingRow): FacilityRecord | null {
  if (!r.機構代碼 || !r.機構名稱 || !r.地址 || !r.機構類別) return null;

  const category = r.機構類別.trim();
  const address = normalizeAddress(r.地址);
  const sourceId = buildNhplatformSourceId(r.機構代碼, r.機構名稱, address);
  const lat = toCoord(r.WGS84緯度);
  const lng = toCoord(r.WGS84經度);
  const validUntil = parseRocDateToIso(r.合格效期);
  const evaluations =
    r.評鑑結果 || validUntil ? [{ year: "", result: r.評鑑結果 || "", validUntil: validUntil || "" }] : undefined;

  const beds = {
    generalNursingBeds: toBedCount(r["一般護理之家-開放床數"]),
    postpartumBeds: toBedCount(r["產後護理床-開放床數"]),
    infantBeds: toBedCount(r["護理類-嬰兒床-開放床數"]),
  };

  const base = {
    sourceId,
    name: r.機構名稱,
    address,
    phone: r.機構電話 || null,
    lat,
    lng,
    serviceTime: null,
    dataOrg: DATA_ORG,
  };

  if (category === POSTPARTUM_CARE_CATEGORY) {
    return {
      ...base,
      facilityType: "postpartum_care",
      sourceKey: "nhplatform_115950_postpartum",
      serviceItem: null,
      extra: { ...beds, evaluations },
    };
  }

  if ((LONG_TERM_CARE_MERGED_CATEGORIES as readonly string[]).includes(category)) {
    return {
      ...base,
      facilityType: "long_term_care",
      sourceKey: "nhplatform_115950_ltc",
      serviceItem: category,
      extra: { ...beds, category, evaluations },
    };
  }

  // Any other 機構類別 value is skipped rather than thrown on — this
  // dataset has only ever shown these 3 values (confirmed live 2026-10-14:
  // 501 一般護理之家 + 751 居家護理所 + 241 產後護理之家 = 1493 of 1494
  // rows, the last being a CSV-quoting edge case of 居家護理所), but a
  // skip here is safer than failing the whole sync if a 4th category
  // appears upstream later.
  return null;
}

export async function fetchNhplatformNursingInstitutions(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) {
    throw new Error(`Nursing institutions nationwide list (115950) request failed: HTTP ${status}`);
  }

  const raw = parseCsv(text) as unknown as NhplatformNursingRow[];
  validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, raw);

  const records: FacilityRecord[] = [];
  for (const r of raw) {
    const record = mapRowToFacilityRecord(r);
    if (record) records.push(record);
  }
  return records;
}
