import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import { twd97ToWgs84 } from "@/lib/server/facilities/twd97";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 臺中市公私協力及私立托嬰中心 (issue #606, parent #599) — dataset 83669,
 * newdatacenter.taichung.gov.tw CSV. One source covering both 性質＝私立／
 * 公設民營 rows (mapped into the shared 私立/公辦民營 category buckets, same
 * convention as ntpcChildcare.ts's 公共托育中心 — "公辦民營" is this family's
 * bucket name, not literally this county's own label).
 *
 * TWD97 座標：地址欄位本身已含「臺中市○○區」前綴，不需要像新北那樣另外補
 * county/行政區，但 X坐標/Y坐標 兩欄是 TWD97 TM2（121°E 分帶）公尺座標，不是
 * lat/lng——用 lib/server/facilities/twd97.ts 的 twd97ToWgs84 轉換（repo 內原
 * 本只有 scripts/import-tgos-geocode-results.mjs 這個 .mjs 腳本有同一套公式，
 * 不在 lib/server 的 TS/bundling 範圍內，所以另外獨立一份）。轉換失敗
 * （null）時 lat/lng 留空，交給既有的 autoGeocode 地址回填流程處理，不擋這
 * 筆資料整體被拒絕。
 *
 * 評鑑結果112年/113年/114年是三個獨立欄位（同一機構逐年評鑑紀錄），取最新一
 * 個「非空白」的年度，格式化成「<等第>(<年度>年)」——跟桃園 168379/168385 的
 * 「甲(111)」風格一致。
 */

const DOWNLOAD_URL = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c56ab0d2-8464-4f18-b15c-1835e254143f";

const DATA_ORG = "臺中市政府社會局（newdatacenter.taichung.gov.tw 開放資料）";

interface TaichungRow {
  性質: string;
  辦理單位: string;
  連絡電話: string;
  地址: string;
  "X坐標": string;
  "Y坐標": string;
  核定收托人數: string;
  收托人數: string;
  收費標準: string;
  評鑑結果112年: string;
  評鑑結果113年: string;
  評鑑結果114年: string;
}

export const taichungChildcareRawSchema = z.object({
  性質: z.string().nullable(),
  辦理單位: z.string().nullable(),
  連絡電話: z.string().nullable(),
  地址: z.string().nullable(),
  "X坐標": z.string().nullable(),
  "Y坐標": z.string().nullable(),
  核定收托人數: z.string().nullable(),
  收托人數: z.string().nullable(),
  收費標準: z.string().nullable(),
  評鑑結果112年: z.string().nullable(),
  評鑑結果113年: z.string().nullable(),
  評鑑結果114年: z.string().nullable(),
});

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed || null;
}

/** Picks the most recent non-empty 評鑑結果 among 112/113/114年, formatted "<等第>(<年度>年)" — matching 桃園's "甲(111)" style. */
function latestEvaluationResult(row: TaichungRow): string | null {
  for (const year of ["114", "113", "112"]) {
    const value = nonEmpty(row[`評鑑結果${year}年` as keyof TaichungRow]);
    if (value) return `${value}(${year}年)`;
  }
  return null;
}

async function fetchTaichungRawRows(): Promise<TaichungRow[]> {
  const { status, text } = await httpGetText(DOWNLOAD_URL);
  if (status < 200 || status >= 300) throw new Error(`臺中市公私協力及私立托嬰中心 (83669) request failed: HTTP ${status}`);
  // Confirmed live 2026-10-14: this CSV ships a doubled UTF-8 BOM (EF BB BF
  // EF BB BF) — parseCsv()'s own BOM strip only removes one occurrence, and
  // JS's String.prototype.trim() does NOT strip U+FEFF, so without this the
  // first header ("性質") would come out as "﻿性質" and fail to match.
  const cleaned = text.replace(/^﻿+/, "");
  return parseCsv(cleaned) as unknown as TaichungRow[];
}

/** Pure (no I/O) builder — separated from the fetch so it can be fixture-tested, same pattern as the other county adapters. */
export function buildTaichungChildcareRecords(rawRows: TaichungRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.辦理單位 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      const category = r.性質 === "公設民營" ? CHILDCARE_CATEGORY.PUBLIC_PRIVATE : CHILDCARE_CATEGORY.PRIVATE;

      const x = Number(r["X坐標"]);
      const y = Number(r["Y坐標"]);
      const converted = twd97ToWgs84(x, y);

      return {
        facilityType: "childcare_center",
        sourceKey: "taichung_childcare_83669",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taichung, r.辦理單位, address),
        name: r.辦理單位,
        address,
        phone: nonEmpty(r.連絡電話),
        lat: converted?.lat ?? null,
        lng: converted?.lng ?? null,
        serviceItem: category,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: {
          category,
          approvedCapacity: nonEmpty(r.核定收托人數),
          actualCapacity: nonEmpty(r.收托人數),
          monthlyFee: nonEmpty(r.收費標準),
          evaluationResult: latestEvaluationResult(r),
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchTaichungChildcare(): Promise<FacilityRecord[]> {
  const rawRows = await fetchTaichungRawRows();
  validateImportRows("臺中市公私協力及私立托嬰中心 (83669)", taichungChildcareRawSchema, rawRows);

  return buildTaichungChildcareRecords(rawRows, todayDataAsOf());
}
