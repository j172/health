import { httpGetText } from "@/lib/server/net/httpClient";

export const MOA_DEBRIS_ALERT_URL =
  "https://data.moa.gov.tw/Service/OpenData/FromM/GetCustomerDebrisAlertInfo.aspx?IsTransData=1&UnitId=018";
export const MOA_DEBRIS_HISTORICAL_DATASET_ID = "7284";

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

export type DebrisAlertLevel = "黃色警戒" | "紅色警戒";

export interface DebrisAlertItem {
  alertLevel: DebrisAlertLevel;
  releaseTime: string;
  debrisStreamCode: string;
  county: string;
  township: string;
  village: string;
}

export interface VillageDebrisDetail {
  village: string;
  alertLevel: DebrisAlertLevel;
  debrisStreamCode: string;
}

export interface TownshipDebrisSummary {
  township: string;
  redCount: number;
  yellowCount: number;
  villages: VillageDebrisDetail[];
}

export interface CountyDebrisSummary {
  county: string;
  redCount: number;
  yellowCount: number;
  totalCount: number;
  townships: TownshipDebrisSummary[];
}

interface CacheEntry {
  timestamp: number;
  alerts: DebrisAlertItem[];
}

let serverCache: CacheEntry | null = null;

/** Normalizes alert level to standard "黃色警戒" | "紅色警戒". */
function normalizeAlertLevel(raw: unknown): DebrisAlertLevel | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "紅色警戒" || s === "紅" || s.includes("紅")) {
    return "紅色警戒";
  }
  if (s === "黃色警戒" || s === "黃" || s.includes("黃")) {
    return "黃色警戒";
  }
  return null;
}

/**
 * Pure parser for MOA UnitId=018 Debris Alert JSON data.
 * Gracefully handles JSON string, array, missing fields, or empty dataset.
 */
export function parseDebrisAlertsJson(data: unknown): DebrisAlertItem[] {
  let parsed = data;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    // If wrapped in an object like { data: [...] } or { result: [...] }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const candidate = obj.data || obj.result || obj.items || obj.DebrisAlertInfo;
      if (Array.isArray(candidate)) {
        parsed = candidate;
      } else {
        return [];
      }
    } else {
      return [];
    }
  }

  const items: DebrisAlertItem[] = [];
  const seen = new Set<string>();

  for (const raw of parsed as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const alertLevel = normalizeAlertLevel(
      r.AlertLevel ?? r.alertLevel ?? r.alert_level ?? r["警戒層級"],
    );
    if (!alertLevel) continue;

    const releaseTime = String(
      r.ReleaseTime ?? r.releaseTime ?? r.release_time ?? r["發布時間"] ?? "",
    ).trim();

    const debrisStreamCode = String(
      r.DebrisStreamCode ??
        r.debrisStreamCode ??
        r.debris_stream_code ??
        r.streamCode ??
        r["潛勢溪流編號"] ??
        "",
    ).trim();

    const county = String(r.County ?? r.county ?? r["縣市"] ?? "").trim();
    const township = String(r.Township ?? r.township ?? r["鄉鎮市區"] ?? "").trim();
    const village = String(r.Village ?? r.village ?? r["村里"] ?? "").trim();

    if (!county && !township && !village) continue;

    const key = `${county}_${township}_${village}_${debrisStreamCode}_${alertLevel}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      alertLevel,
      releaseTime,
      debrisStreamCode,
      county,
      township,
      village,
    });
  }

  // Sort by Red alert first, then County, Township, Village
  return items.sort((a, b) => {
    if (a.alertLevel !== b.alertLevel) {
      return a.alertLevel === "紅色警戒" ? -1 : 1;
    }
    const c = a.county.localeCompare(b.county, "zh-Hant");
    if (c !== 0) return c;
    const t = a.township.localeCompare(b.township, "zh-Hant");
    if (t !== 0) return t;
    return a.village.localeCompare(b.village, "zh-Hant");
  });
}

/**
 * Groups a flat list of debris alert items by County and Township for easy UI drilldown and mapping.
 */
export function groupDebrisAlertsByCounty(alerts: DebrisAlertItem[]): CountyDebrisSummary[] {
  const countyMap = new Map<
    string,
    {
      redCount: number;
      yellowCount: number;
      townships: Map<
        string,
        {
          redCount: number;
          yellowCount: number;
          villages: VillageDebrisDetail[];
        }
      >;
    }
  >();

  for (const item of alerts) {
    if (!countyMap.has(item.county)) {
      countyMap.set(item.county, {
        redCount: 0,
        yellowCount: 0,
        townships: new Map(),
      });
    }

    const cEntry = countyMap.get(item.county)!;
    const isRed = item.alertLevel === "紅色警戒";
    if (isRed) {
      cEntry.redCount += 1;
    } else {
      cEntry.yellowCount += 1;
    }

    if (!cEntry.townships.has(item.township)) {
      cEntry.townships.set(item.township, {
        redCount: 0,
        yellowCount: 0,
        villages: [],
      });
    }

    const tEntry = cEntry.townships.get(item.township)!;
    if (isRed) {
      tEntry.redCount += 1;
    } else {
      tEntry.yellowCount += 1;
    }

    tEntry.villages.push({
      village: item.village,
      alertLevel: item.alertLevel,
      debrisStreamCode: item.debrisStreamCode,
    });
  }

  const summaries: CountyDebrisSummary[] = [];

  for (const [county, data] of countyMap.entries()) {
    const townshipList: TownshipDebrisSummary[] = [];
    for (const [township, tData] of data.townships.entries()) {
      townshipList.push({
        township,
        redCount: tData.redCount,
        yellowCount: tData.yellowCount,
        villages: tData.villages,
      });
    }

    // Sort townships with highest red alert count first
    townshipList.sort((a, b) => b.redCount - a.redCount || b.yellowCount - a.yellowCount);

    summaries.push({
      county,
      redCount: data.redCount,
      yellowCount: data.yellowCount,
      totalCount: data.redCount + data.yellowCount,
      townships: townshipList,
    });
  }

  // Sort counties with highest red alerts first
  return summaries.sort((a, b) => b.redCount - a.redCount || b.totalCount - a.totalCount);
}

/** Returns debris alerts matching a specific county. */
export function getDebrisAlertsForCounty(county: string, alerts: DebrisAlertItem[]): DebrisAlertItem[] {
  if (!county) return [];
  const target = county.trim();
  return alerts.filter(
    (a) => a.county === target || a.county.includes(target) || target.includes(a.county),
  );
}

/** Whether there are active debris alerts in the stream. */
export function hasActiveDebrisAlerts(alerts: DebrisAlertItem[]): boolean {
  return Array.isArray(alerts) && alerts.length > 0;
}

/**
 * Fetches and caches real-time debris alerts from MOA OpenData.
 * Never throws — returns cached data or empty array on failure.
 */
export async function fetchDebrisAlerts(options: { force?: boolean } = {}): Promise<DebrisAlertItem[]> {
  const now = Date.now();
  if (!options.force && serverCache && now - serverCache.timestamp < CACHE_TTL_MS) {
    return serverCache.alerts;
  }

  try {
    const { status, text } = await httpGetText(MOA_DEBRIS_ALERT_URL, {
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    if (status >= 200 && status < 300 && text) {
      const alerts = parseDebrisAlertsJson(text);
      serverCache = {
        timestamp: now,
        alerts,
      };
      return alerts;
    }
  } catch (error) {
    console.error("[debrisAlerts] Failed to fetch MOA debris alerts:", error);
  }

  if (serverCache) {
    return serverCache.alerts;
  }

  return [];
}

/** Resets cache for unit tests. */
export function __resetDebrisAlertsCacheForTests(): void {
  serverCache = null;
}
