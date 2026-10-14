import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareDedupeKey,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 臺北市托嬰中心與居家托育服務中心 (issue #601, parent #599) — 5 個各自獨立的
 * data.taipei CSV 來源，各自登記成 runSync.ts `SOURCES`的獨立項目（延續 #560
 * 的 `only` 選擇性重跑）：
 *   - 121278 私立托嬰中心
 *   - 121337 公辦民營托嬰中心（含收托人數）
 *   - 121981 準公共托嬰中心（含核定/實際收托人數、評鑑結果）
 *   - 126984 社區公共托育家園
 *   - 126986 居家托育服務中心——facilityType 是 `home_childcare_center`，不是
 *     `childcare_center`：這是「協助家長找保母」的媒合窗口，不是托嬰機構本身
 *
 * 臺北獨有的去重問題：私立表（121278）跟準公共表（121981）大量重疊——同一家
 * 私立托嬰中心申請「準公共」資格後，兩個名冊都會列出同一筆資料，只是準公共表
 * 多了核定/實際收托人數跟評鑑結果兩欄。2026-10-14 實測 215 筆準公共資料裡有
 * 113 筆跟私立表的某一筆是同一機構（詳見 childcareCenterShared.ts
 * `stripFloorForDedupe` 的說明）。
 *
 * 處理方式：`fetchTaipeiChildcareQuasi()` 永遠原樣輸出全部 215 筆（分類＝準
 * 公共，帶核定/實際收托人數與評鑑結果）；`fetchTaipeiChildcarePrivate()`
 * 另外在自己的 fetch() 內部也抓一次準公共表（CSV 只有幾百筆，重抓成本低），
 * 算出重疊機構的去重 key 集合，輸出時把那些機構濾掉，只留下「只在私立表出
 * 現」的機構（分類＝私立）。兩個來源仍各自獨立登記、各自可被 `--only` 單獨
 * 重跑；重疊判斷的唯一副作用是私立來源的 fetch() 多一次 HTTP 請求，不影響
 * 準公共來源本身的獨立性或輸出。
 */

const PRIVATE_URL =
  "https://data.taipei/api/dataset/081df75e-85c7-464c-b125-546920911c5c/resource/e7cdaca3-e9da-46f9-b857-395e6e8e06a6/download";
const PUBLIC_PRIVATE_URL =
  "https://data.taipei/api/dataset/9c9a3f77-8340-48d8-bc0e-f9155521b758/resource/a02ccc34-dd28-4c5d-b527-c5433ec1a453/download";
const QUASI_URL =
  "https://data.taipei/api/dataset/aeaaa517-089c-42a7-ad5b-60fef89c3545/resource/75bb5396-4880-4301-9dde-2f7ccae00d57/download";
const COMMUNITY_URL =
  "https://data.taipei/api/dataset/7c66efcd-d073-401c-b18a-7a46728776c4/resource/f1418a7a-4bdf-41fc-869c-63703dc16363/download";
const HOME_CENTER_URL =
  "https://data.taipei/api/dataset/41c729ce-c848-492a-b7a6-db468f06c17c/resource/5cf938d7-350e-433b-b8be-280710038d74/download";

const DATA_ORG = "臺北市政府社會局（data.taipei 開放資料）";

interface TaipeiPrivateRow {
  機構名稱: string;
  地址: string;
  電話: string;
}
export const taipeiPrivateRawSchema = z.object({
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
});

interface TaipeiPublicPrivateRow {
  機構名稱: string;
  收托人數: string;
  地址: string;
  電話: string;
}
export const taipeiPublicPrivateRawSchema = z.object({
  機構名稱: z.string().nullable(),
  收托人數: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
});

interface TaipeiQuasiRow {
  機構名稱: string;
  地址: string;
  電話: string;
  核定收托人數: string;
  實際收托人數: string;
  評鑑結果: string;
}
export const taipeiQuasiRawSchema = z.object({
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
  核定收托人數: z.string().nullable(),
  實際收托人數: z.string().nullable(),
  評鑑結果: z.string().nullable(),
});

interface TaipeiCommunityOrHomeRow {
  機構名稱: string;
  地址: string;
  電話: string;
}
// 126984 (社區公共托育家園) and 126986 (居家托育服務中心) share the exact same
// raw shape (序號,機構類型,機構名稱,地址,電話) — one schema for both.
export const taipeiCommunityOrHomeRawSchema = z.object({
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
});

async function fetchCsvRows<T>(url: string, label: string): Promise<T[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`${label} request failed: HTTP ${status}`);
  return parseCsv(text) as unknown as T[];
}

async function fetchTaipeiQuasiRawRows(): Promise<TaipeiQuasiRow[]> {
  const rows = await fetchCsvRows<TaipeiQuasiRow>(QUASI_URL, "臺北市準公共托嬰中心 (121981)");
  validateImportRows("臺北市準公共托嬰中心 (121981)", taipeiQuasiRawSchema, rows);
  return rows.filter((r) => r.機構名稱 && r.地址);
}

function phoneOrNull(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").trim();
  return trimmed || null;
}

/**
 * Pure (no I/O) builder for the 121278 私立 source's output — separated from
 * `fetchTaipeiChildcarePrivate` purely so the private/準公共 dedupe scenario
 * can be fixture-tested with realistic sample rows, without mocking the
 * network calls both tables' fetches make.
 */
export function buildTaipeiPrivateRecords(
  rawRows: TaipeiPrivateRow[],
  quasiRows: TaipeiQuasiRow[],
  dataAsOf: string,
): FacilityRecord[] {
  const quasiDedupeKeys = new Set(quasiRows.map((r) => buildChildcareDedupeKey(r.機構名稱, r.地址)));

  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .filter((r) => !quasiDedupeKeys.has(buildChildcareDedupeKey(r.機構名稱, r.地址)))
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "childcare_center",
        sourceKey: "taipei_childcare_121278",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: CHILDCARE_CATEGORY.PRIVATE,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category: CHILDCARE_CATEGORY.PRIVATE, dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchTaipeiChildcarePrivate(): Promise<FacilityRecord[]> {
  const [rawRows, quasiRows] = await Promise.all([
    fetchCsvRows<TaipeiPrivateRow>(PRIVATE_URL, "臺北市私立托嬰中心 (121278)"),
    fetchTaipeiQuasiRawRows(),
  ]);
  validateImportRows("臺北市私立托嬰中心 (121278)", taipeiPrivateRawSchema, rawRows);

  return buildTaipeiPrivateRecords(rawRows, quasiRows, todayDataAsOf());
}

export async function fetchTaipeiChildcarePublicPrivate(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<TaipeiPublicPrivateRow>(PUBLIC_PRIVATE_URL, "臺北市公辦民營托嬰中心 (121337)");
  validateImportRows("臺北市公辦民營托嬰中心 (121337)", taipeiPublicPrivateRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "childcare_center",
        sourceKey: "taipei_childcare_121337",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: CHILDCARE_CATEGORY.PUBLIC_PRIVATE,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category: CHILDCARE_CATEGORY.PUBLIC_PRIVATE, approvedCapacity: nonEmpty(r.收托人數), dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchTaipeiChildcareQuasi(): Promise<FacilityRecord[]> {
  const rows = await fetchTaipeiQuasiRawRows();
  const dataAsOf = todayDataAsOf();

  return rows.map((r) => {
    const address = normalizeAddress(r.地址);
    return {
      facilityType: "childcare_center",
      sourceKey: "taipei_childcare_121981",
      sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, r.機構名稱, address),
      name: r.機構名稱,
      address,
      phone: phoneOrNull(r.電話),
      lat: null,
      lng: null,
      serviceItem: CHILDCARE_CATEGORY.QUASI_PUBLIC,
      serviceTime: null,
      dataOrg: DATA_ORG,
      extra: {
        category: CHILDCARE_CATEGORY.QUASI_PUBLIC,
        approvedCapacity: nonEmpty(r.核定收托人數),
        actualCapacity: nonEmpty(r.實際收托人數),
        evaluationResult: nonEmpty(r.評鑑結果),
        dataAsOf,
      },
    } satisfies FacilityRecord;
  });
}

export async function fetchTaipeiChildcareCommunity(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<TaipeiCommunityOrHomeRow>(COMMUNITY_URL, "臺北市社區公共托育家園 (126984)");
  validateImportRows("臺北市社區公共托育家園 (126984)", taipeiCommunityOrHomeRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "childcare_center",
        sourceKey: "taipei_childcare_126984",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: CHILDCARE_CATEGORY.COMMUNITY,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category: CHILDCARE_CATEGORY.COMMUNITY, dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchTaipeiChildcareHomeCenter(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<TaipeiCommunityOrHomeRow>(HOME_CENTER_URL, "臺北市居家托育服務中心 (126986)");
  validateImportRows("臺北市居家托育服務中心 (126986)", taipeiCommunityOrHomeRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      return {
        facilityType: "home_childcare_center",
        sourceKey: "taipei_childcare_126986",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { dataAsOf },
      } satisfies FacilityRecord;
    });
}
