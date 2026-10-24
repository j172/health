import "server-only";
import { httpGetText } from "@/lib/server/net/httpClient";

export interface SubmarineCableIncident {
  id: string;
  cable_id: string;
  cable_name: string;
  incident_type: "cut" | "fault" | "maintenance";
  status: "active" | "repairing" | "resolved";
  occurred_at: string;
  estimated_repair_at: string | null;
  impact_summary: string;
  affected_isps: string[];
}

export type CableHealthStatus = "NORMAL" | "DEGRADED" | "CRITICAL";

export interface SubmarineCableStatusResponse {
  status: CableHealthStatus;
  statusLabel: string;
  activeIncidentsCount: number;
  incidents: SubmarineCableIncident[];
  updatedAt: string;
}

export const SUBMARINE_CABLE_INCIDENTS_URL =
  "https://raw.githubusercontent.com/seadog007/smc.peering.tw/master/src/data/incidents.json";

export const STATUS_LABELS: Record<CableHealthStatus, string> = {
  NORMAL: "國際與離島海底通訊電纜運作正常，對外網路頻寬維持常態水準。",
  DEGRADED: "局部海纜障礙維修中，部分跨國或離島連線延遲可能稍增，整體通訊骨幹穩定。",
  CRITICAL: "多條對外或離島關鍵海纜發生嚴重中斷，通訊受到顯著影響；請防範斷網假訊息，遵循官方通訊指引。",
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const SWR_STALE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes SWR window
const FETCH_TIMEOUT_MS = 10_000; // 10s timeout

interface CacheEntry {
  data: SubmarineCableStatusResponse;
  timestamp: number;
}

let serverCache: CacheEntry | null = null;
let isRevalidating = false;

/**
 * Pure parser function for smc.peering.tw raw incident data.
 * Always returns a valid SubmarineCableStatusResponse, gracefully falling back on errors.
 */
export function parseSubmarineCableIncidents(jsonText: string): SubmarineCableStatusResponse {
  const fallbackResponse: SubmarineCableStatusResponse = {
    status: "NORMAL",
    statusLabel: STATUS_LABELS.NORMAL,
    activeIncidentsCount: 0,
    incidents: [],
    updatedAt: new Date().toISOString(),
  };

  if (!jsonText || typeof jsonText !== "string") {
    return fallbackResponse;
  }

  const trimmed = jsonText.trim();
  if (!trimmed) {
    return fallbackResponse;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return fallbackResponse;
  }

  let rawList: unknown[] = [];
  let updatedAt = new Date().toISOString();

  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.incidents)) {
      rawList = obj.incidents;
    } else if (Array.isArray(obj.data)) {
      rawList = obj.data;
    } else if (Array.isArray(obj.items)) {
      rawList = obj.items;
    }
    if (typeof obj.updated_at === "string") {
      updatedAt = obj.updated_at;
    } else if (typeof obj.updatedAt === "string") {
      updatedAt = obj.updatedAt;
    }
  } else {
    return fallbackResponse;
  }

  const incidents: SubmarineCableIncident[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;

    const id = String(r.id ?? `inc-${i + 1}`).trim();
    const cable_id = String(r.cable_id ?? r.cableId ?? id).trim();
    const cable_name = String(r.cable_name ?? r.cableName ?? cable_id).trim();

    let incident_type: SubmarineCableIncident["incident_type"] = "fault";
    const rawType = String(r.incident_type ?? r.incidentType ?? "").toLowerCase();
    if (rawType === "cut") incident_type = "cut";
    else if (rawType === "maintenance") incident_type = "maintenance";
    else if (rawType === "fault") incident_type = "fault";

    let status: SubmarineCableIncident["status"] = "active";
    const rawStatus = String(r.status ?? "").toLowerCase();
    if (rawStatus === "repairing") status = "repairing";
    else if (rawStatus === "resolved") status = "resolved";
    else if (rawStatus === "active") status = "active";

    const occurred_at = String(r.occurred_at ?? r.occurredAt ?? "").trim();
    const estimated_repair_at =
      r.estimated_repair_at !== null && r.estimated_repair_at !== undefined
        ? String(r.estimated_repair_at).trim()
        : r.estimatedRepairAt !== null && r.estimatedRepairAt !== undefined
        ? String(r.estimatedRepairAt).trim()
        : null;

    const impact_summary = String(r.impact_summary ?? r.impactSummary ?? "").trim();
    const affected_isps = Array.isArray(r.affected_isps)
      ? r.affected_isps.map((isp) => String(isp).trim()).filter(Boolean)
      : Array.isArray(r.affectedIsps)
      ? r.affectedIsps.map((isp) => String(isp).trim()).filter(Boolean)
      : [];

    incidents.push({
      id,
      cable_id,
      cable_name,
      incident_type,
      status,
      occurred_at,
      estimated_repair_at,
      impact_summary,
      affected_isps,
    });
  }

  const activeIncidents = incidents.filter(
    (inc) => inc.status === "active" || inc.status === "repairing"
  );
  const activeIncidentsCount = activeIncidents.length;

  // Check domestic isolation / domestic cut (e.g. 臺馬 / 台馬)
  const hasDomesticCut = activeIncidents.some((inc) => {
    const text = `${inc.cable_name} ${inc.cable_id} ${inc.impact_summary}`;
    return (
      text.includes("臺馬") ||
      text.includes("台馬") ||
      text.includes("馬祖") ||
      text.includes("金門") ||
      /matsu|kinmen/i.test(text)
    );
  });

  let status: CableHealthStatus = "NORMAL";
  if (activeIncidentsCount >= 3 || hasDomesticCut) {
    status = "CRITICAL";
  } else if (activeIncidentsCount >= 1) {
    status = "DEGRADED";
  } else {
    status = "NORMAL";
  }

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    activeIncidentsCount,
    incidents,
    updatedAt,
  };
}

/**
 * Fetch incidents from upstream GitHub raw URL and update in-memory cache.
 */
async function fetchAndCacheSubmarineCableStatus(): Promise<SubmarineCableStatusResponse> {
  const { status, text } = await httpGetText(SUBMARINE_CABLE_INCIDENTS_URL, {
    timeoutMs: FETCH_TIMEOUT_MS,
  });

  if (status >= 200 && status < 300 && text) {
    const response = parseSubmarineCableIncidents(text);
    serverCache = {
      data: response,
      timestamp: Date.now(),
    };
    return response;
  }

  throw new Error(`Upstream returned HTTP status ${status}`);
}

/**
 * Get Submarine Cable Resilience Status with in-memory SWR caching (15 min TTL).
 * Never throws — falls back to cached data or safe default status.
 */
export async function getSubmarineCableStatus(options?: {
  force?: boolean;
}): Promise<SubmarineCableStatusResponse> {
  const now = Date.now();

  // Fresh cache hit
  if (!options?.force && serverCache && now - serverCache.timestamp < CACHE_TTL_MS) {
    return serverCache.data;
  }

  // Stale cache hit within SWR window -> return stale immediately, trigger async revalidation
  if (!options?.force && serverCache && now - serverCache.timestamp < SWR_STALE_WINDOW_MS) {
    if (!isRevalidating) {
      isRevalidating = true;
      fetchAndCacheSubmarineCableStatus()
        .catch((err) => {
          console.error("[submarineCableService] SWR revalidation failed:", err);
        })
        .finally(() => {
          isRevalidating = false;
        });
    }
    return serverCache.data;
  }

  // Cache missing or expired -> fetch synchronously
  try {
    return await fetchAndCacheSubmarineCableStatus();
  } catch (error) {
    console.error("[submarineCableService] Failed to fetch submarine cable incidents:", error);
    if (serverCache) {
      return serverCache.data;
    }
    return {
      status: "NORMAL",
      statusLabel: STATUS_LABELS.NORMAL,
      activeIncidentsCount: 0,
      incidents: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

export const fetchSubmarineCableStatus = getSubmarineCableStatus;

/** Resets in-memory cache for unit tests */
export function __resetSubmarineCableCacheForTests(): void {
  serverCache = null;
  isRevalidating = false;
}
