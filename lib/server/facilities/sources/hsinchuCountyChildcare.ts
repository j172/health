import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpRequest } from "@/lib/server/net/httpClient";
import { decodeBig5, normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 新竹縣立案托嬰中心暨加入準公共化名冊 (issue #607, parent #599). data.gov.tw
 * dataset 109321, CSV resource hosted on ws.hsinchu.gov.tw. data.gov.tw's own
 * metadata labels this resource's charset "BIG5"; the ticket calls it cp950.
 * Decoded with the same `TextDecoder("big5")` path as every other Big5
 * source in this codebase (lib/server/facilities/csv.ts's `decodeBig5`) —
 * cp950 is Microsoft's Big5 codepage and differs from plain Big5 only in a
 * handful of characters outside the common-Han range; `TextDecoder` has no
 * separate "cp950" label (confirmed: `new TextDecoder("cp950")` throws), and
 * decoding a real cp950-labelled sample from this dataset with "big5"
 * produced fully correct, readable Chinese text (confirmed live 2026-10-14).
 *
 * Unlike every other county in this family, 新竹縣 has no separate 準公共
 * roster — 準公共 status is a column (加入準公共化) on the one 私立 roster
 * instead of a second table, so there is no taipeiChildcare.ts-style
 * cross-table dedupe to do here. 設立別 (establishment type) × 加入準公共化
 * together determine `category`:
 *   - 設立別="公托家園" (confirmed always 加入準公共化="(公共化)")  → 社區公共托育家園
 *   - 設立別="公設民營" (confirmed always 加入準公共化="(公共化)")  → 公辦民營 (same
 *     concept as 臺北/新北's 公辦民營, this county's own term for it)
 *   - 設立別="私立" & 加入準公共化="已加入"                        → 準公共
 *   - 設立別="私立" & 加入準公共化=""                              → 私立
 * Confirmed live 2026-10-14 against all 99 rows: exactly these 4
 * (設立別, 加入準公共化) combinations appear, no others.
 *
 * This county's roster is also the only one of the four new to this ticket
 * that carries fee information (ticket AC's "含收費資訊") — 核准收費項目金額
 * 單位_新臺幣 is a free-text composite (e.g. "20,790/月(含餐費)註冊費:
 * 36,000/半年月費:13,290/月餐點費:1,500/月"), not a single number, so it is
 * stored as-is in `extra.monthlyFee` (already typed `string | number | null`
 * on FacilityExtraJson for exactly this reason) rather than parsed apart.
 *
 * Reachability (egress-probe run
 * https://github.com/j172/health/actions/runs/38556225761, 2026-10-14):
 * reachable from an ordinary residential network, but timed out from both
 * the production host and a GitHub Actions runner — same "genuinely
 * unreachable from production/CI right now" situation as 新竹市 (see
 * hsinchuCityChildcare.ts's module comment for what that implies for this
 * source's scheduled sync until it changes).
 */
const SOURCE_URL =
  "https://ws.hsinchu.gov.tw/001/Upload/1/opendata/8774/279/d58f1e93-d7f6-4280-bf35-6464024488a2.csv";

const DATA_ORG = "新竹縣政府社會處（ws.hsinchu.gov.tw 開放資料）";

interface HsinchuCountyChildcareRow {
  設立別: string;
  機構名稱: string;
  地址: string;
  核准托嬰人數: string;
  電話: string;
  加入準公共化: string;
  核准收費項目金額單位_新臺幣: string;
}

export const hsinchuCountyChildcareRawSchema = z.object({
  設立別: z.string().nullable(),
  機構名稱: z.string().nullable(),
  地址: z.string().nullable(),
  核准托嬰人數: z.string().nullable(),
  電話: z.string().nullable(),
  加入準公共化: z.string().nullable(),
  核准收費項目金額單位_新臺幣: z.string().nullable(),
});

function phoneOrNull(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").trim();
  return trimmed || null;
}

/** 設立別 × 加入準公共化 → one of the 4 childcare-center categories, or null for a combination not seen live (fails safe rather than mis-tagging). */
export function categorizeHsinchuCounty(setupType: string, joinedQuasi: string): string | null {
  const type = (setupType || "").trim();
  const joined = (joinedQuasi || "").trim();
  if (type === "公托家園") return CHILDCARE_CATEGORY.COMMUNITY;
  if (type === "公設民營") return CHILDCARE_CATEGORY.PUBLIC_PRIVATE;
  if (type === "私立") return joined === "已加入" ? CHILDCARE_CATEGORY.QUASI_PUBLIC : CHILDCARE_CATEGORY.PRIVATE;
  return null;
}

export function buildHsinchuCountyChildcareRecords(
  rawRows: HsinchuCountyChildcareRow[],
  dataAsOf: string,
): FacilityRecord[] {
  return rawRows
    .filter((r) => r.機構名稱 && r.地址)
    .map((r) => {
      // 地址 already carries the full "新竹縣○○鄉鎮市區" prefix — confirmed
      // live 2026-10-14, unlike 新北 (ntpcChildcare.ts), which needs one
      // prepended.
      const address = normalizeAddress(r.地址);
      const category = categorizeHsinchuCounty(r.設立別, r.加入準公共化);
      return {
        facilityType: "childcare_center",
        sourceKey: "hsinchu_county_childcare_109321",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.hsinchuCounty, r.機構名稱, address),
        name: r.機構名稱,
        address,
        phone: phoneOrNull(r.電話),
        lat: null,
        lng: null,
        serviceItem: category,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: {
          category,
          approvedCapacity: nonEmpty(r.核准托嬰人數),
          monthlyFee: nonEmpty(r.核准收費項目金額單位_新臺幣),
          dataAsOf,
        },
      } satisfies FacilityRecord;
    });
}

export async function fetchHsinchuCountyChildcare(): Promise<FacilityRecord[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts. Using
  // httpRequest (not httpGetText) to get the raw buffer, since this
  // resource's body needs a Big5/cp950 decode, not UTF-8.
  const res = await httpRequest(SOURCE_URL, { timeoutMs: 15000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`新竹縣立案托嬰中心名冊 (109321) request failed: HTTP ${res.status}`);
  }

  const text = decodeBig5(res.buffer);
  const rawRows = parseCsv(text) as unknown as HsinchuCountyChildcareRow[];
  validateImportRows("新竹縣立案托嬰中心名冊 (109321)", hsinchuCountyChildcareRawSchema, rawRows);

  return buildHsinchuCountyChildcareRecords(rawRows, todayDataAsOf());
}
