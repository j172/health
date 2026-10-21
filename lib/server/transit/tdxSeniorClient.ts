import "server-only";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import { TDX_SENIORS_API_BASE } from "@/lib/server/tdx/seniors";
import type { RailSystem } from "./railSystems";

/**
 * Base path for TDX's "Senior" (樂齡/敬老) Rail accessibility APIs — issue
 * #434 / docs/archive/specs/tdx-senior-rail-accessibility-upgrade.md section 2.
 * issue #730：只剩 Facility/Alert（每小時電梯停用公告）一支；Facility／Service／Map／Transfer
 * 四支（每日軌道無障礙同步）已移除。
 *
 * The 2026-10-10 implementation guessed `/api/advanced/v1/Senior/Rail/...`
 * and every tier/version variant 404'd with a valid token. The real base is
 * TDX's separate `seniors` service category (see lib/server/tdx/seniors.ts).
 */
const SENIOR_RAIL_BASE = `${TDX_SENIORS_API_BASE}/Rail/Station`;

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

export const fetchSeniorFacilityAlert = (system: RailSystem) =>
  fetchSeniorRail<SeniorStationFacilityAlert>("/Facility/Alert", system);
