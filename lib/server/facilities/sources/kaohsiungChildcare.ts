import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { normalizeAddress } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 高雄市嬰幼兒托育服務 (issue #606, parent #599) — 2 個 openapi.kcg.gov.tw
 * JSON 來源：
 *   - 128099 私立托嬰中心（53 筆，確認於 2026-10-14）
 *   - 128100 公設民營托嬰中心（17 筆，確認於 2026-10-14）
 *
 * 跟其他 5 個縣市不同，這個 API 本身就直接回傳 lat/lng（高雄市政府自己的
 * 開放資料平台內建地理編碼），不需要跟 twd97.ts 或既有的地址 autoGeocode 回
 * 填流程打交道。
 *
 * 筆數偏少（53+17，遠低於臺北/新北/桃園動輒上百筆）且 data.gov.tw 上該資料集
 * 的 modifiedDate 停在 2025-06——issue #606 AC 要求「頁面明確標示『資料可能
 * 不完整』」而非當作最新全量資料呈現：每一筆都帶 extra_json.dataNote，由
 * facilityConfigs.ts 的 extraFields 與 FacilitySearchContent.tsx 顯示，不是
 * 只在頁面最上方放一行全站通用警語就算了事。
 */

const PRIVATE_URL = "https://openapi.kcg.gov.tw/Api/Service/Get/f55e7795-9051-4e75-ae39-6b66c4b3997d";
const PUBLIC_PRIVATE_URL = "https://openapi.kcg.gov.tw/Api/Service/Get/51ab0d2f-8a9c-423d-95b0-367202180db1";

const DATA_ORG = "高雄市政府社會局（openapi.kcg.gov.tw 開放資料）";

const DATA_NOTE =
  "本頁高雄市資料筆數偏少且已知停留在 2025 年 6 月，可能未反映最新全量名冊，請以衛福部社家署「托育管理資訊系統全國系統性查詢」做最終確認。";

interface KcgRow {
  id: string;
  lat: string;
  lng: string;
  informaddress: string;
  informtel: string;
  servItem: string;
  servTime: string;
  text: string;
}

interface KcgApiResponse {
  data: KcgRow[];
}

export const kcgChildcareRowSchema = z.object({
  id: z.string().nullable(),
  lat: z.string().nullable(),
  lng: z.string().nullable(),
  informaddress: z.string().nullable(),
  informtel: z.string().nullable(),
  servItem: z.string().nullable(),
  servTime: z.string().nullable(),
  text: z.string().nullable(),
});

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed || null;
}

function numberOrNull(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Pure (no I/O) builder, same pattern as the other county adapters — fixture-testable without mocking HTTP. */
export function buildKaohsiungChildcareRecords(
  rows: KcgRow[],
  sourceKey: string,
  category: string,
  dataAsOf: string,
): FacilityRecord[] {
  return rows
    .filter((r) => r.text && r.informaddress)
    .map((r) => {
      const address = normalizeAddress(r.informaddress);
      return {
        facilityType: "childcare_center",
        sourceKey,
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.kaohsiung, r.text, address),
        name: r.text,
        address,
        phone: nonEmpty(r.informtel),
        lat: numberOrNull(r.lat),
        lng: numberOrNull(r.lng),
        serviceItem: category,
        serviceTime: nonEmpty(r.servTime),
        dataOrg: DATA_ORG,
        extra: { category, dataNote: DATA_NOTE, dataAsOf },
      } satisfies FacilityRecord;
    });
}

async function fetchKcgRows(url: string, label: string): Promise<KcgRow[]> {
  const { status, data } = await httpGetJson<KcgApiResponse>(url);
  if (status < 200 || status >= 300) throw new Error(`${label} request failed: HTTP ${status}`);
  const rows = data?.data ?? [];
  validateImportRows(label, kcgChildcareRowSchema, rows);
  return rows;
}

export async function fetchKaohsiungChildcarePrivate(): Promise<FacilityRecord[]> {
  const rows = await fetchKcgRows(PRIVATE_URL, "高雄市私立托嬰中心 (128099)");
  return buildKaohsiungChildcareRecords(rows, "kcg_childcare_128099", CHILDCARE_CATEGORY.PRIVATE, todayDataAsOf());
}

export async function fetchKaohsiungChildcarePublicPrivate(): Promise<FacilityRecord[]> {
  const rows = await fetchKcgRows(PUBLIC_PRIVATE_URL, "高雄市公設民營托嬰中心 (128100)");
  return buildKaohsiungChildcareRecords(rows, "kcg_childcare_128100", CHILDCARE_CATEGORY.PUBLIC_PRIVATE, todayDataAsOf());
}
