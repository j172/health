import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { getTdxToken } from "@/lib/server/tdx/auth";
import type { RailSystem } from "./railStationCounty";

/**
 * Base path for TDX's "Senior" (樂齡/敬老) Rail accessibility APIs — issue
 * #434 / docs/specs/tdx-senior-rail-accessibility-upgrade.md section 2.
 *
 * ⚠️ UNVERIFIED: this is the spec's documented best guess
 * (`/api/advanced/v1/Senior/Rail/...`, inferred from the swagger UI showing
 * `/V1/Senior/Rail/...`). Empirically tested live on 2026-10-10 with a real
 * OAuth2 token from this app's TDX_CLIENT_ID/TDX_CLIENT_SECRET — every one of
 * the following returned 404 `{"message":"Resouce Not Found"}`, while a
 * known-good Basic Rail call (`/api/basic/v2/Rail/TRA/Station`) succeeded
 * with the same token, ruling out an auth/header mistake:
 *   /api/advanced/v1/Senior/Rail/Station/Facility/{System}
 *   /api/advanced/v2/Senior/Rail/Station/Facility/{System}
 *   /api/basic/v1/Senior/Rail/Station/Facility/{System}
 *   /api/basic/v2/Senior/Rail/Station/Facility/{System}
 *   /api/v1/Senior/Rail/Station/Facility/{System} and /api/v2/... (no tier)
 *   /api/Senior/Rail/Station/Facility/{System} (no version)
 *   Several segment reorderings (Rail/Senior/..., .../Senior/Facility, Senior
 *   /Station/Facility without "Rail", lowercase, {System} as query param
 *   instead of path segment, etc.)
 * All 10 RailSystem codes and both THSR/TRTC were tried on the primary path.
 * See the PR description for the full list of attempts. This constant is
 * kept as a single override point — once the real path is confirmed (TDX
 * member portal entitlement page, or a browser Network-tab capture of the
 * live swagger "Try it out" call), fixing this is a one-line change here.
 */
const SENIOR_RAIL_BASE = "https://tdx.transportdata.tw/api/advanced/v1/Senior/Rail/Station";

export interface SeniorFacilityItem {
  FacilityID?: string;
  FacilityName?: string;
  FloorLevel?: string;
  Description?: string;
  ExitID?: string;
  ExitName?: string;
  PositionLon?: number;
  PositionLat?: number;
  PlatformID?: string;
  PlatformName?: string;
}

/**
 * The Facility response's known categories (Elevators/Toilets/AEDs/
 * PowerBankRentalStations per the spec's example payload) plus an index
 * signature — TDX may add further facility-category arrays over time, and
 * flattenFacilityCategories() below picks up any array-valued key rather
 * than hard-coding an exhaustive category list.
 */
export interface SeniorStationFacility {
  StationID: string;
  StationName?: string;
  AutorityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
  Elevators?: SeniorFacilityItem[];
  Toilets?: SeniorFacilityItem[];
  AEDs?: SeniorFacilityItem[];
  PowerBankRentalStations?: SeniorFacilityItem[];
  [category: string]: unknown;
}

export interface SeniorStationService {
  StationID: string;
  StationName?: string;
  ServiceName?: string;
  Description?: string;
  ServiceURL?: string;
  ServicePhone?: string;
  AutorityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
}

export interface SeniorStationMap {
  StationID: string;
  StationName?: string;
  FloorLevel?: string;
  MapName?: string;
  MapURL?: string;
  Geometry?: string;
  AutorityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
}

export interface SeniorStationTransfer {
  StationID: string;
  StationName?: string;
  FloorLevel?: string;
  ExitID?: string;
  ExitName?: string;
  PositionLon?: number;
  PositionLat?: number;
  TransferRouteDescription?: string;
  TransferMode?: string;
  TransferDescription?: string;
  IsOnSiteTransfer?: boolean;
  AutorityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
}

export interface SeniorStationFacilityAlert {
  AlertID: string;
  Reason?: string;
  StationID: string;
  StationName?: string;
  FacilityID?: string;
  FacilityName?: string;
  Description?: string;
  StartTime?: string;
  EndTime?: string;
  PublishTime?: string;
  ExitID?: string;
  ExitName?: string;
  AutorityCode?: string;
  UpdateTime?: string;
  UpdateInterval?: number;
}

const NON_CATEGORY_KEYS = new Set([
  "StationID",
  "StationName",
  "AutorityCode",
  "UpdateTime",
  "UpdateInterval",
]);

/** Flattens every array-valued facility category on a SeniorStationFacility row into a single {category, item}[] list, regardless of exactly which category names TDX returns. */
export const flattenFacilityCategories = (
  facility: SeniorStationFacility,
): Array<{ category: string; item: SeniorFacilityItem }> => {
  const out: Array<{ category: string; item: SeniorFacilityItem }> = [];
  for (const [key, value] of Object.entries(facility)) {
    if (NON_CATEGORY_KEYS.has(key)) continue;
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      out.push({ category: key, item: item as SeniorFacilityItem });
    }
  }
  return out;
};

const fetchSeniorRail = async <T>(path: string, system: RailSystem): Promise<T[]> => {
  const token = await getTdxToken();
  if (!token) return [];

  const url = `${SENIOR_RAIL_BASE}${path}/${system}?%24format=JSON`;
  const res = await httpGetJson<T[]>(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    timeoutMs: 12000,
  });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX Senior/Rail ${path}/${system} returned status ${res.status}`);
  }
  return res.data;
};

export const fetchSeniorFacility = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationFacility>("/Facility", system);

export const fetchSeniorService = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationService>("/Service", system);

export const fetchSeniorMap = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationMap>("/Map", system);

export const fetchSeniorTransfer = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationTransfer>("/Transfer", system);

export const fetchSeniorFacilityAlert = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationFacilityAlert>("/Facility/Alert", system);
