import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, normalizeAddress, parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareDedupeKey,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 桃園市托嬰中心 (issue #606, parent #599) — 2 個各自獨立的
 * opendata.tycg.gov.tw CSV 來源：
 *   - 168379「114年桃園市公私立托嬰中心名冊」(機構類別：私立／公設民營)
 *   - 168385「115年桃園市準公共化托嬰中心名冊」(全部都是準公共)
 *
 * 跟臺北 121278/121981 完全一樣的私立/準公共重疊問題：2026-10-14 實測 168385
 * 的 167 筆裡有 129 筆（name+address 完全比對）跟 168379 裡的某一筆是同一機
 * 構，所以沿用 childcareCenterShared.ts 的
 * buildChildcareDedupeKey/stripFloorForDedupe 去重——168385 永遠原樣輸出全部
 * 筆數（分類＝準公共），168379 過濾掉跟 168385 重疊的機構，只留下「只在
 * 168379 出現」的（分類沿用 168379 自己的機構類別：私立或公設民營）。
 *
 * cp950 編碼：這兩份 CSV 都是 Big5/cp950，用 lib/server/facilities/csv.ts 的
 * decodeBig5 手動解碼（不能用 taipeiChildcare.ts/ntpcChildcare.ts 的
 * `httpGetText`，那個函式內部強制把回應 body 當 UTF-8 解碼）。
 *
 * 資料集名稱帶年度（114年/115年）且會逐年變動，兩個嚴重後果：
 *   1. sourceId 絕對不能含資料集 ID 或年度字樣（buildChildcareSourceId 本來
 *      就只用 county+機構名稱+地址，天然滿足）。
 *   2. CSV 表頭本身也有年度字樣（例如「是否加入準公共化服務合作\n(契約效期至
 *      114.12.31)」，168385 是「...116.07.31」），而且兩份 CSV 同一個欄位
 *      （例如「核定床位數」）在 168379 沒有換行、168385 卻是「核定\n床位
 *      數」。zod schema 若直接比對這些原始表頭字串，下一年度表頭日期一變就會
 *      整個 schema 判定失敗——`normalizeRow()` 先把表頭空白/換行去掉再用前
 *      綴比對，取出跟年度/排版無關的穩定欄位，validateImportRows 只驗證這些
 *      穩定欄位，真正的欄位改名/消失才會被抓到。
 */

const PUBLIC_PRIVATE_URL =
  "https://opendata.tycg.gov.tw/api/dataset/4f74432e-54ec-477d-8feb-f3c34ceb68b9/resource/0b246836-526c-47e2-b6ce-045f605b0dc1/download";
const QUASI_URL =
  "https://opendata.tycg.gov.tw/api/dataset/85f7cb16-a7ff-462a-af7e-721c6ea503bd/resource/a19a1612-86af-4526-b3cb-a28a14395b92/download";

const DATA_ORG = "桃園市政府社會局（opendata.tycg.gov.tw 開放資料）";

export interface TycgNormalizedRow {
  機構類別: string | null;
  機構名稱: string | null;
  地址: string | null;
  聯絡電話: string | null;
  評鑑結果: string | null;
  平均月費: string | null;
  核定床位數: string | null;
}

export const tycgNormalizedRowSchema = z.object({
  機構類別: z.string().nullable(),
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  聯絡電話: z.string().nullable(),
  評鑑結果: z.string().nullable(),
  平均月費: z.string().nullable(),
  核定床位數: z.string().nullable(),
});

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  return trimmed || null;
}

/** Normalizes a raw CSV header for matching: strips all whitespace (incl. embedded newlines) so "核定床位數" and "核定\n床位數" compare equal. */
function normalizeHeaderKey(key: string): string {
  return key.replace(/\s+/g, "");
}

/** Finds a raw row's value by header prefix (after whitespace-normalizing both sides) — tolerant of the year-stamped suffix on 是否加入準公共化服務合作's header. */
function findByPrefix(row: Record<string, string>, prefix: string): string | undefined {
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeaderKey(key).startsWith(prefix)) return value;
  }
  return undefined;
}

/** Converts a raw parsed CSV row into the stable field set both 168379/168385 share, independent of this year's header date-stamps/line-break layout. */
export function normalizeTycgRow(raw: Record<string, string>): TycgNormalizedRow {
  return {
    機構類別: nonEmpty(findByPrefix(raw, "機構類別")),
    機構名稱: nonEmpty(findByPrefix(raw, "機構名稱")),
    地址: nonEmpty(findByPrefix(raw, "地址")),
    聯絡電話: nonEmpty(findByPrefix(raw, "聯絡電話")),
    評鑑結果: nonEmpty(findByPrefix(raw, "最近ㄧ次評鑑結果")),
    平均月費: nonEmpty(findByPrefix(raw, "平均月費")),
    核定床位數: nonEmpty(findByPrefix(raw, "核定床位數")),
  };
}

/** Extracts the leading digit run from values like "20790\n(113年8月新生適用)" or "20,790" → "20790". Returns null when no leading digits exist at all. */
function extractLeadingNumber(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/^[\d,]+/);
  return match ? match[0].replace(/,/g, "") : null;
}

async function fetchTycgCsvRows(url: string, label: string): Promise<Record<string, string>[]> {
  // Deliberately not httpGetText() — it force-decodes the response body as
  // UTF-8, which would mangle this Big5/cp950 CSV. Fetch the raw buffer via
  // httpRequest() and decode it ourselves.
  const response = await httpRequest(url);
  if (response.status < 200 || response.status >= 300) throw new Error(`${label} request failed: HTTP ${response.status}`);
  const text = decodeBig5(response.buffer);
  return parseCsv(text);
}

function phoneOrNull(raw: string | null): string | null {
  return raw ? raw.trim() || null : null;
}

async function fetchTycgQuasiNormalizedRows(): Promise<TycgNormalizedRow[]> {
  const rawRows = await fetchTycgCsvRows(QUASI_URL, "桃園市準公共化托嬰中心 (168385)");
  const normalized = rawRows.map(normalizeTycgRow);
  validateImportRows("桃園市準公共化托嬰中心 (168385)", tycgNormalizedRowSchema, normalized);
  return normalized.filter((r) => r.機構名稱 && r.地址);
}

/**
 * Pure (no I/O) builder for the 168379 公私立 source's output, mirroring
 * `buildTaipeiPrivateRecords` — kept separate from the fetch so the
 * 168379/168385 dedupe scenario can be fixture-tested without mocking HTTP.
 */
export function buildTycgPublicPrivateRecords(
  rawRows: TycgNormalizedRow[],
  quasiRows: TycgNormalizedRow[],
  dataAsOf: string,
): FacilityRecord[] {
  const quasiDedupeKeys = new Set(
    quasiRows.filter((r) => r.機構名稱 && r.地址).map((r) => buildChildcareDedupeKey(r.機構名稱!, r.地址!)),
  );

  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .filter((r) => !quasiDedupeKeys.has(buildChildcareDedupeKey(r.機構名稱!, r.地址!)))
    .map((r) => {
      const address = normalizeAddress(r.地址!);
      const category = r.機構類別 === "公設民營" ? CHILDCARE_CATEGORY.PUBLIC_PRIVATE : CHILDCARE_CATEGORY.PRIVATE;
      return {
        facilityType: "childcare_center",
        sourceKey: "tycg_childcare_168379",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taoyuan, r.機構名稱!, address),
        name: r.機構名稱!,
        address,
        phone: phoneOrNull(r.聯絡電話),
        lat: null,
        lng: null,
        serviceItem: category,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: {
          category,
          approvedCapacity: extractLeadingNumber(r.核定床位數),
          evaluationResult: r.評鑑結果,
          monthlyFee: extractLeadingNumber(r.平均月費),
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchTycgChildcarePublicPrivate(): Promise<FacilityRecord[]> {
  const [rawRows, quasiRows] = await Promise.all([
    fetchTycgCsvRows(PUBLIC_PRIVATE_URL, "桃園市公私立托嬰中心 (168379)"),
    fetchTycgQuasiNormalizedRows(),
  ]);
  const normalizedRaw = rawRows.map(normalizeTycgRow);
  validateImportRows("桃園市公私立托嬰中心 (168379)", tycgNormalizedRowSchema, normalizedRaw);

  return buildTycgPublicPrivateRecords(normalizedRaw, quasiRows, todayDataAsOf());
}

export async function fetchTycgChildcareQuasi(): Promise<FacilityRecord[]> {
  const rows = await fetchTycgQuasiNormalizedRows();
  const dataAsOf = todayDataAsOf();

  return rows.map((r) => {
    const address = normalizeAddress(r.地址!);
    return {
      facilityType: "childcare_center",
      sourceKey: "tycg_childcare_168385",
      sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taoyuan, r.機構名稱!, address),
      name: r.機構名稱!,
      address,
      phone: phoneOrNull(r.聯絡電話),
      lat: null,
      lng: null,
      serviceItem: CHILDCARE_CATEGORY.QUASI_PUBLIC,
      serviceTime: null,
      dataOrg: DATA_ORG,
      extra: {
        category: CHILDCARE_CATEGORY.QUASI_PUBLIC,
        approvedCapacity: extractLeadingNumber(r.核定床位數),
        evaluationResult: r.評鑑結果,
        monthlyFee: extractLeadingNumber(r.平均月費),
        dataAsOf,
      },
    } satisfies FacilityRecord;
  });
}
