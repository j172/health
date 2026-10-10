import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getTdxToken } from "@/lib/server/tdx/auth";

/**
 * Base paths for TDX's "Senior" (樂齡/敬老) Tourism + SeniorCard APIs — issue
 * #436 / docs/specs/tdx-senior-tourism-and-card-new-tool.md section 2.
 *
 * ⚠️ UNVERIFIED, same risk as lib/server/transit/tdxSeniorClient.ts's
 * `SENIOR_RAIL_BASE` (issue #434): that file documents 10+ base-path variants
 * for TDX's "Senior/Rail" sub-category that all returned 404 with a valid
 * OAuth2 token, and the real base path for the whole `Senior` category was
 * never confirmed. Tourism and SeniorCard are different sub-categories under
 * the same `Senior` category, so they almost certainly 404 the same way until
 * that base path is fixed. Rather than re-burn API calls re-discovering the
 * identical 404s, this reuses the exact same tier/version pattern
 * (`/api/advanced/v1/Senior/...`) Spec A settled on, with only the sub-path
 * changed (`Tourism/...`, `SeniorCard/...` instead of `Rail/...`). Every
 * fetch function below is wrapped by callers in try/catch (see runSync.ts)
 * so a continued 404 here degrades to an `errors[]` entry, never a crash —
 * ensureSeniorFriendlySeeded() in queries.ts keeps the page non-empty via
 * seed data in the meantime. Once the real base path is confirmed, both
 * constants below are the only lines that need to change.
 */
const SENIOR_TOURISM_BASE = "https://tdx.transportdata.tw/api/advanced/v1/Senior/Tourism";
const SENIOR_CARD_BASE = "https://tdx.transportdata.tw/api/advanced/v1/Senior/SeniorCard";

export interface TourismFacilityItem {
  FacilityID?: string;
  FacilityName?: string;
  BuildingName?: string;
  PositionLon?: number;
  PositionLat?: number;
  FloorLevel?: string;
  Description?: string;
}

/**
 * The Facility response's known categories (Toilets/ChargingServices/
 * InformationCenters per the spec's example payload) plus an index
 * signature — TDX may report further facility-category arrays, and
 * flattenTourismFacilityCategories() below picks up any array-valued key
 * rather than hard-coding an exhaustive category list (same idiom as
 * lib/server/transit/tdxSeniorClient.ts's flattenFacilityCategories()).
 */
export interface TourismFacility {
  UpdateTime?: string;
  UpdateInterval?: number;
  AttractionID: string;
  AttractionName?: string;
  CityCode?: string;
  Toilets?: TourismFacilityItem[];
  ChargingServices?: TourismFacilityItem[];
  InformationCenters?: TourismFacilityItem[];
  [category: string]: unknown;
}

export interface TourismService {
  AttractionID: string;
  AttractionName?: string;
  ServiceName?: string;
  Description?: string;
  ServiceURL?: string;
  ServicePhone?: string;
  CityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
}

export interface TourismPackage {
  UpdateTime?: string;
  UpdateInterval?: number;
  PackageName: string;
  Description?: string;
  BookingURL?: string;
  PictureURL?: string;
  IssuingEntity?: string;
}

export interface TourismFacilityAlert {
  UpdateTime?: string;
  UpdateInterval?: number;
  AlertID: string;
  Reason?: string;
  Type?: string;
  ID?: string;
  Name?: string;
  StartTime?: string;
  EndTime?: string;
  PublishTime?: string;
}

export interface SeniorCardSubsidy {
  Category?: string;
  Description?: string;
}

export interface SeniorCardEntry {
  UpdateTime?: string;
  UpdateInterval?: number;
  AutorityName?: string;
  SeniorCardName?: string;
  URL?: string;
  Subsidies?: SeniorCardSubsidy[];
}

const NON_CATEGORY_KEYS = new Set([
  "UpdateTime",
  "UpdateInterval",
  "AttractionID",
  "AttractionName",
  "CityCode",
]);

/** Flattens every array-valued facility category on a TourismFacility row into a single {category, item}[] list, regardless of exactly which category names TDX returns (mirrors tdxSeniorClient.ts's flattenFacilityCategories()). */
export const flattenTourismFacilityCategories = (
  facility: TourismFacility,
): Array<{ category: string; item: TourismFacilityItem }> => {
  const out: Array<{ category: string; item: TourismFacilityItem }> = [];
  for (const [key, value] of Object.entries(facility)) {
    if (NON_CATEGORY_KEYS.has(key)) continue;
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      out.push({ category: key, item: item as TourismFacilityItem });
    }
  }
  return out;
};

/**
 * TDX CityCode (Tourism §2.1) / City (SeniorCard §2.2) → this repo's
 * canonical Traditional-Chinese county name (lib/constants/taiwanDistricts.ts
 * TAIWAN_COUNTIES). The spec's only confirmed example (`NAN` = 南投縣)
 * matches between the two APIs, and TDX's advanced-tier "Senior" category
 * conventionally shares this 3-letter county abbreviation scheme across its
 * sub-APIs — but since both base paths are still 404ing (see the base-path
 * comment above), this mapping could not be verified against a live
 * response. Treat it as best-effort: unmapped codes fall back to the raw
 * code string rather than null so a sync run never silently drops a row for
 * want of a county match.
 */
export const SENIOR_CITY_CODE_TO_COUNTY: Record<string, string> = {
  TPE: "臺北市",
  NWT: "新北市",
  TAO: "桃園市",
  TXG: "臺中市",
  TNN: "臺南市",
  KHH: "高雄市",
  KEE: "基隆市",
  HSZ: "新竹市",
  HSQ: "新竹縣",
  MIA: "苗栗縣",
  CHA: "彰化縣",
  NAN: "南投縣",
  YUN: "雲林縣",
  CYQ: "嘉義縣",
  CYI: "嘉義市",
  PIF: "屏東縣",
  ILA: "宜蘭縣",
  HUA: "花蓮縣",
  TTT: "臺東縣",
  KIN: "金門縣",
  PEN: "澎湖縣",
  LIE: "連江縣",
};

/** The 22 SeniorCard City path-parameter codes (spec §2.2), in the exact order the spec lists them. */
export const SENIOR_CARD_CITIES = [
  "TPE", "NWT", "TAO", "TXG", "TNN", "KHH", "KEE", "HSZ", "HSQ", "MIA",
  "CHA", "NAN", "YUN", "CYQ", "CYI", "PIF", "ILA", "HUA", "TTT", "KIN",
  "PEN", "LIE",
] as const;

export type SeniorCardCity = (typeof SENIOR_CARD_CITIES)[number];

export const cityCodeToCounty = (code?: string | null): string | null => {
  if (!code) return null;
  return SENIOR_CITY_CODE_TO_COUNTY[code] || code;
};

const fetchSeniorTourism = async <T>(path: string): Promise<T[]> => {
  const token = await getTdxToken();
  if (!token) return [];

  const url = `${SENIOR_TOURISM_BASE}${path}?%24format=JSON`;
  const res = await httpGetJson<T[]>(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    timeoutMs: 12000,
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Senior/Tourism ${path} returned status ${res.status}`);
  }
  return res.data;
};

export const fetchTourismFacility = () => fetchSeniorTourism<TourismFacility>("/Facility");

export const fetchTourismService = () => fetchSeniorTourism<TourismService>("/Service");

export const fetchTourismPackage = () => fetchSeniorTourism<TourismPackage>("/SeniorTourPackage");

export const fetchTourismFacilityAlert = () => fetchSeniorTourism<TourismFacilityAlert>("/Facility/Alert");

export const fetchSeniorCard = async (city: SeniorCardCity): Promise<SeniorCardEntry[]> => {
  const token = await getTdxToken();
  if (!token) return [];

  const url = `${SENIOR_CARD_BASE}/City/${city}?%24format=JSON`;
  const res = await httpGetJson<SeniorCardEntry[]>(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    timeoutMs: 12000,
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Senior/SeniorCard City/${city} returned status ${res.status}`);
  }
  return res.data;
};
