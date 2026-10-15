import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 臺南市私立托嬰中心名冊暨收費標準一覽表 (issue #606, parent #599) — dataset
 * 6178, data.tainan.gov.tw CSV (UTF-8, no Big5 decode needed).
 *
 * data.gov.tw lists 4 resource IDs under this one dataset (2 CSV/JSON pairs
 * with slightly different column sets — confirmed live 2026-10-14) — this
 * picks resource `342fad63-5463-4642-9b19-8611316c5fd1` specifically: it has
 * the richer, newer column set (129 rows incl. 每學期註冊/教材費／月費／每月
 * 副食品費／平均月費) vs. the other pair's older/shorter schema (90 rows, no
 * separate registration-fee column). The dataset's own `modifiedDate` is
 * 2025-06-10 — this site's own `extraFields`/`dataAsOf` surfaces when *this
 * site* last synced it, which is what issue #606's "頁面顯示資料日期"
 * acceptance criterion actually needs; the upstream content itself simply
 * hasn't changed since mid-2025.
 *
 * 地址欄位已經是完整地址（含「臺南市○○區」前綴），不需要另外拼接。
 * 準公共化單位欄位是「是」/「否」——直接決定 category（準公共 vs 私立），跟
 * 桃園/臺北的機構類別欄位性質不同（這裡沒有獨立的「準公共」名冊，跟新北一
 * 樣內含在同一張表裡，不需要跨表去重）。
 */

const DOWNLOAD_URL = "https://data.tainan.gov.tw/File/ResourceCsvDownload/342fad63-5463-4642-9b19-8611316c5fd1";

const DATA_ORG = "臺南市政府社會局（data.tainan.gov.tw 開放資料）";

interface TainanRow {
  中心名稱: string;
  地址: string;
  電話: string;
  核准收托人數: string;
  "截至10/14實際收托人數": string;
  "每學期註冊/教材費": string;
  月費: string;
  每月副食品費: string;
  準公共化單位: string;
}

export const tainanChildcareRawSchema = z.object({
  中心名稱: z.string().nullable(),
  地址: z.string().nullable(),
  電話: z.string().nullable(),
  核准收托人數: z.string().nullable(),
  準公共化單位: z.string().nullable(),
});

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed || null;
}

async function fetchTainanRawRows(): Promise<TainanRow[]> {
  const { status, text } = await httpGetText(DOWNLOAD_URL);
  if (status < 200 || status >= 300) throw new Error(`臺南市私立托嬰中心名冊暨收費標準一覽表 (6178) request failed: HTTP ${status}`);
  // Same doubled-BOM quirk as Taichung's export (EF BB BF EF BB BF) —
  // parseCsv()'s own strip only removes one occurrence.
  const cleaned = text.replace(/^﻿+/, "");
  return parseCsv(cleaned) as unknown as TainanRow[];
}

/** Pure (no I/O) builder, same pattern as the other county adapters — fixture-testable without mocking HTTP. */
export function buildTainanChildcareRecords(rawRows: TainanRow[], dataAsOf: string): FacilityRecord[] {
  return rawRows
    .filter((r) => r.中心名稱 && r.地址)
    .map((r) => {
      const address = normalizeAddress(r.地址);
      const category = r.準公共化單位 === "是" ? CHILDCARE_CATEGORY.QUASI_PUBLIC : CHILDCARE_CATEGORY.PRIVATE;

      return {
        facilityType: "childcare_center",
        sourceKey: "tainan_childcare_6178",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.tainan, r.中心名稱, address),
        name: r.中心名稱,
        address,
        phone: nonEmpty(r.電話),
        lat: null,
        lng: null,
        serviceItem: category,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: {
          category,
          approvedCapacity: nonEmpty(r.核准收托人數),
          actualCapacity: nonEmpty(r["截至10/14實際收托人數"]),
          registrationFee: nonEmpty(r["每學期註冊/教材費"]),
          monthlyFee: nonEmpty(r.月費),
          mealFee: nonEmpty(r.每月副食品費),
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchTainanChildcare(): Promise<FacilityRecord[]> {
  const rawRows = await fetchTainanRawRows();
  validateImportRows("臺南市私立托嬰中心名冊暨收費標準一覽表 (6178)", tainanChildcareRawSchema, rawRows);

  return buildTainanChildcareRecords(rawRows, todayDataAsOf());
}
