import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";

// data.gov.tw 133353「各縣市指定藥癮戒治機構及替代治療機構及非鴉片類藥癮治療補助機構」
// 提供機關登記為臺北市立聯合醫院，但內容是全國資料——2026-10-14 實測 216 筆、涵蓋 22
// 縣市。CSV，UTF-8 with BOM。
//
// 這個下載網址是從一般住宅網路實測成功的（issue #566），**還沒有從正式主機驗證能否連
// 線**。data.taipei 是六都開放資料平台，理論上被資料中心 IP 擋住的風險比中央部會低，
// 但沒驗證過就不能保證——部署這個來源前，協調者務必先用正式主機跑一次這個來源的 sync
// （例如 `node scripts/run-facilities-sync.mjs --only addiction_treatment_133353` 或等
// 下一次排程）確認連得到，再讓它進入常態排程。
const SOURCE_URL =
  "https://data.taipei/api/dataset/0e28b90e-3372-4d18-b95e-7dfb4c870a69/resource/ef08f222-ec13-47aa-baaa-6de0d7adf98e/download";

interface AddictionTreatmentRawRow {
  縣市別: string;
  機構名稱: string;
  電話: string;
  地址: string;
  戒治機構模式: string;
  戒治服務內容: string;
}

// Critical-field schema for the raw rows (see docs/archive/specs/mol-
// occupational-injury-source-id-migration.md for the incident this pattern
// guards against). 機構名稱/地址/縣市別 are identity-bearing (sourceId and
// the county-prefix repair below both depend on them); 戒治機構模式/戒治服務
// 內容 are the two fields this ticket exists to surface (mental-health 成癮
// 防治分頁), so a silent upstream rename of either should fail loudly too.
// `.nullable()` (not `.optional()`) so a column entirely missing from every
// row (renamed/removed upstream) fails validation, while one row's
// legitimately blank value (confirmed live: 30/216 rows have an empty 戒治
// 服務內容 — e.g. 非鴉片類藥癮治療補助機構 with no 戒治服務內容 of their own)
// still passes.
export const addictionTreatmentRawSchema = z.object({
  縣市別: z.string().nullable(),
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  戒治機構模式: z.string().nullable(),
  戒治服務內容: z.string().nullable(),
});

// 縣市別 is NOT the county name — it's the 5-digit 戶政司行政區域代碼. Confirmed
// live 2026-10-14 against all 216 rows: exactly these 22 codes appear, each
// mapping to one county/city (matches the ticket's "涵蓋 22 縣市"). If a
// future sync run hits a code not in this table, withCountyPrefix() below
// falls back to leaving the address untouched rather than prepending an
// empty string.
export const ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE: Record<string, string> = {
  "63000": "臺北市",
  "65000": "新北市",
  "68000": "桃園市",
  "66000": "臺中市",
  "67000": "臺南市",
  "64000": "高雄市",
  "10017": "基隆市",
  "10018": "新竹市",
  "10020": "嘉義市",
  "10002": "宜蘭縣",
  "10004": "新竹縣",
  "10005": "苗栗縣",
  "10007": "彰化縣",
  "10008": "南投縣",
  "10009": "雲林縣",
  "10010": "嘉義縣",
  "10013": "屏東縣",
  "10014": "臺東縣",
  "10015": "花蓮縣",
  "10016": "澎湖縣",
  "9007": "金門縣",
  "9020": "連江縣",
};

// 6 of 216 rows prefix the real address with a free-text annotation before a
// colon — confirmed live 2026-10-14: "替代治療執行地點:新北市...",
// "本院(無提供替代治療)：基隆市...", "(含替代治療)：基隆市...", "信義院區(含替代
// 治療)：苗栗縣...", "東興院區(無提供替代治療)：苗栗縣...",
// "樹林院區(含替代治療)：臺南市...". None of the other 210 rows' addresses
// contain a colon at all, so taking the text after the LAST colon (half- or
// full-width) — when present — safely drops the annotation without touching
// any normal address.
export function stripAddressAnnotation(address: string): string {
  const lastColonIndex = Math.max(address.lastIndexOf("："), address.lastIndexOf(":"));
  if (lastColonIndex === -1) return address;
  const after = address.slice(lastColonIndex + 1).trim();
  return after || address;
}

// Same technique as molOccupationalInjuryHospital.ts's withCountyPrefix: one
// row (序號 115, 南投縣竹山鎮衛生所) gives an address starting straight at the
// 鄉鎮市區 level with no county name at all ("竹山鎮雲林里公所路126號") — prepend
// the county so the address is geocodable/displayable on its own, but only
// when it's actually missing (checking both the official 臺 and informal 台
// spelling) to avoid producing a doubled "臺南市台南市...".
export function withCountyPrefix(county: string, address: string): string {
  if (!address) return county;
  if (!county) return address;
  const informalCounty = county.replace(/^臺/, "台");
  if (address.startsWith(county) || address.startsWith(informalCounty)) return address;
  return `${county}${address}`;
}

export function buildAddictionTreatmentSourceId(name: string, address?: string | null): string {
  return `${name.trim()}|${(address || "").trim()}`.slice(0, 100);
}

export async function fetchAddictionTreatmentFacilities(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(SOURCE_URL);
  if (status < 200 || status >= 300) throw new Error(`Addiction-treatment facilities (133353) request failed: HTTP ${status}`);

  const raw = parseCsv(text) as unknown as AddictionTreatmentRawRow[];
  validateImportRows("Addiction-treatment facilities (133353)", addictionTreatmentRawSchema, raw);

  return raw
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const countyName = ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE[r.縣市別] || "";
      const deAnnotated = stripAddressAnnotation(normalizeAddress(r.地址));
      const address = normalizeAddress(withCountyPrefix(countyName, deAnnotated));

      return {
        facilityType: "addiction_treatment",
        sourceKey: "addiction_treatment_133353",
        sourceId: buildAddictionTreatmentSourceId(r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: r.電話 ? toHalfwidthDigits(r.電話) : null,
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: "衛生福利部（data.gov.tw 133353，臺北市立聯合醫院上架）",
        extra: {
          addictionTreatmentMode: r.戒治機構模式 || null,
          addictionTreatmentService: r.戒治服務內容 || null,
        },
      };
    });
}
