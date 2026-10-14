import { z } from "zod";
import type { FacilityRecord } from "@/lib/server/facilities/queries";
import { httpGetText } from "@/lib/server/net/httpClient";
import { normalizeAddress, parseCsv, toHalfwidthDigits } from "@/lib/server/facilities/csv";
import { validateImportRows } from "@/lib/server/validation/importSchema";
import {
  CHILDCARE_CATEGORY,
  CHILDCARE_COUNTY_CODE,
  buildChildcareSourceId,
  todayDataAsOf,
} from "@/lib/server/facilities/sources/childcareCenterShared";

/**
 * 新北市托嬰中心與居家托育服務中心 (issue #601, parent #599) — 3 個各自獨立的
 * data.ntpc.gov.tw CSV 來源，各自登記成 runSync.ts `SOURCES` 的獨立項目：
 *   - 125380 私立托嬰中心（含可收托人數）
 *   - 126222 公共托育中心（新北市自己的用詞，分類歸到跟臺北「公辦民營」一樣
 *     的 extra_json.category 桶——都是政府出資委託民間團體經營的托嬰中心，只
 *     是兩縣市官方名稱不同）
 *   - 125505 居家托育服務中心——facilityType 是 `home_childcare_center`，跟
 *     臺北 126986 同一個 facilityType
 *
 * 新北沒有臺北那種私立/準公共重疊問題（新北沒有獨立的「準公共」名冊，準公共
 * 資格內含在私立托嬰中心名冊裡，不是另一張表），所以這三個來源互相獨立，不需
 * 要 taipeiChildcare.ts 那套去重邏輯。
 *
 * 新北的原始地址欄本身不含縣市/行政區（例如「莊敬路46號2樓」），要跟 area/
 * county+town 欄位組合才是完整地址——跟臺北 5 個來源的地址欄已經是完整地址
 * 不同，這裡每個 fetch 都要自己補county/行政區前綴。
 */

const PRIVATE_URL = "https://data.ntpc.gov.tw/api/datasets/69cecdb0-7796-48df-84e5-99e4f1274245/csv/file";
const PUBLIC_URL = "https://data.ntpc.gov.tw/api/datasets/b3faf2aa-e96b-4f2f-b647-da47dc094860/csv/file";
const HOME_CENTER_URL = "https://data.ntpc.gov.tw/api/datasets/cfc42867-f272-46d2-9fde-c10ee5feb2c3/csv/file";

const DATA_ORG = "新北市政府社會局（data.ntpc.gov.tw 開放資料）";

interface NtpcPrivateRow {
  title: string;
  area: string;
  address: string;
  localcallservice: string;
  person: string;
}
export const ntpcPrivateRawSchema = z.object({
  title: z.string().nullable(),
  area: z.string().nullable(),
  address: z.string().nullable(),
  localcallservice: z.string().nullable(),
  person: z.string().nullable(),
});

interface NtpcPublicRow {
  name: string;
  county: string;
  town: string;
  address: string;
  localcallservice: string;
}
export const ntpcPublicRawSchema = z.object({
  name: z.string().nullable(),
  county: z.string().nullable(),
  town: z.string().nullable(),
  address: z.string().nullable(),
  localcallservice: z.string().nullable(),
});

interface NtpcHomeCenterRow {
  title: string;
  area: string;
  address: string;
  localcallservice: string;
  servicearea: string;
}
export const ntpcHomeCenterRawSchema = z.object({
  title: z.string().nullable(),
  area: z.string().nullable(),
  address: z.string().nullable(),
  localcallservice: z.string().nullable(),
  servicearea: z.string().nullable(),
});

async function fetchCsvRows<T>(url: string, label: string): Promise<T[]> {
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`${label} request failed: HTTP ${status}`);
  return parseCsv(text) as unknown as T[];
}

function phoneOrNull(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").replace(/\s+/g, " ").trim();
  return trimmed ? toHalfwidthDigits(trimmed) : null;
}

function nonEmpty(raw: string | undefined | null): string | null {
  const trimmed = (raw || "").trim();
  return trimmed || null;
}

export async function fetchNtpcChildcarePrivate(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<NtpcPrivateRow>(PRIVATE_URL, "新北市私立托嬰中心 (125380)");
  validateImportRows("新北市私立托嬰中心 (125380)", ntpcPrivateRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.title && r.address)
    .map((r) => {
      // `area` already carries the full "新北市○○區" prefix — the row's own
      // `address` column never repeats it (confirmed live 2026-10-14).
      const address = normalizeAddress(`${r.area || ""}${r.address}`);
      return {
        facilityType: "childcare_center",
        sourceKey: "ntpc_childcare_125380",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.newTaipei, r.title, address),
        name: r.title,
        address,
        phone: phoneOrNull(r.localcallservice),
        lat: null,
        lng: null,
        serviceItem: CHILDCARE_CATEGORY.PRIVATE,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category: CHILDCARE_CATEGORY.PRIVATE, approvedCapacity: nonEmpty(r.person), dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchNtpcChildcarePublic(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<NtpcPublicRow>(PUBLIC_URL, "新北市公共托育中心 (126222)");
  validateImportRows("新北市公共托育中心 (126222)", ntpcPublicRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.name && r.address)
    .map((r) => {
      // `town` is the short district name only ("汐止區") — `county` ("新北市")
      // has to be prepended separately, unlike the private/home-center
      // sources whose `area` column already carries the full prefix.
      const address = normalizeAddress(`${r.county || ""}${r.town || ""}${r.address}`);
      return {
        facilityType: "childcare_center",
        sourceKey: "ntpc_childcare_126222",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.newTaipei, r.name, address),
        name: r.name,
        address,
        phone: phoneOrNull(r.localcallservice),
        lat: null,
        lng: null,
        serviceItem: CHILDCARE_CATEGORY.PUBLIC_PRIVATE,
        serviceTime: null,
        dataOrg: DATA_ORG,
        extra: { category: CHILDCARE_CATEGORY.PUBLIC_PRIVATE, dataAsOf },
      } satisfies FacilityRecord;
    });
}

export async function fetchNtpcChildcareHomeCenter(): Promise<FacilityRecord[]> {
  const rawRows = await fetchCsvRows<NtpcHomeCenterRow>(HOME_CENTER_URL, "新北市居家托育服務中心 (125505)");
  validateImportRows("新北市居家托育服務中心 (125505)", ntpcHomeCenterRawSchema, rawRows);
  const dataAsOf = todayDataAsOf();

  return rawRows
    .filter((r) => r.title && r.address)
    .map((r) => {
      const address = normalizeAddress(`${r.area || ""}${r.address}`);
      return {
        facilityType: "home_childcare_center",
        sourceKey: "ntpc_childcare_125505",
        sourceId: buildChildcareSourceId(CHILDCARE_COUNTY_CODE.newTaipei, r.title, address),
        name: r.title,
        address,
        phone: phoneOrNull(r.localcallservice),
        lat: null,
        lng: null,
        serviceItem: null,
        serviceTime: null,
        dataOrg: DATA_ORG,
        // servicearea (e.g. "板橋(漢生東路以南)", "汐止、瑞芳、平溪、雙溪、貢寮")
        // reuses the same extra_json.serviceDistrict field FacilitySearchContent
        // already renders for other facility types (see
        // scripts/import-mohw-ltc-gis.mjs) — Taipei's home centers don't set
        // this since their names already encode the one district each covers.
        extra: { serviceDistrict: nonEmpty(r.servicearea), dataAsOf },
      } satisfies FacilityRecord;
    });
}
