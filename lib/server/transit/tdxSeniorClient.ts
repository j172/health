import "server-only";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import { TDX_SENIORS_API_BASE } from "@/lib/server/tdx/seniors";
import type { RailSystem } from "./railStationCounty";

/**
 * Base path for TDX's "Senior" (樂齡/敬老) Rail accessibility APIs — issue
 * #434 / docs/archive/specs/tdx-senior-rail-accessibility-upgrade.md section 2.
 *
 * The 2026-10-10 implementation guessed `/api/advanced/v1/Senior/Rail/...`
 * and every tier/version variant 404'd with a valid token. The real base is
 * TDX's separate `seniors` service category (see lib/server/tdx/seniors.ts).
 */
const SENIOR_RAIL_BASE = `${TDX_SENIORS_API_BASE}/Rail/Station`;

export interface SeniorFacilityItem {
  FacilityID?: string;
  FacilityName?: string;
  FloorLevel?: string;
  Description?: string;
  ExitID?: string;
  ExitName?: string;
  /** Typed `string` in TDX's OpenAPI document — coerce with parseTdxCoordinate(). */
  PositionLon?: string | number;
  PositionLat?: string | number;
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
  /** Typed `string` in TDX's OpenAPI document — coerce with parseTdxCoordinate(). */
  PositionLon?: string | number;
  PositionLat?: string | number;
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

/**
 * Every call goes through tdxGetJsonWithRetry(), i.e. the process-wide
 * 5-requests-per-minute limiter shared by every TDX basic-tier caller (see
 * lib/server/tdx/rateLimiter.ts) plus 429 back-off. The first live run
 * (2026-10-13, issue #434) fired 40+ requests in 3-system parallel batches and
 * every system after TRA/THSR got HTTP 429.
 *
 * A missing token throws rather than returning [] — a silent empty array was
 * indistinguishable from "TDX has no data" and hid the production host having
 * no TDX credentials at all (`{"ok":true, Upserted:0, errors:[]}` every run).
 */
const fetchSeniorRail = async <T>(path: string, system: RailSystem): Promise<T[]> => {
  const token = await getTdxToken();
  if (!token) throw new Error("TDX credentials missing or token request failed");

  const url = `${SENIOR_RAIL_BASE}${path}/${system}?%24format=JSON`;
  const res = await tdxGetJsonWithRetry<T[]>(url, token, { timeoutMs: 12000 });
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
