import "server-only";
import crypto from "node:crypto";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { tdxGetJsonWithRetry } from "@/lib/server/tdx/getJsonWithRetry";
import type { MetroAlertItem, RailAlertSystemCode } from "./types";

/**
 * TDX's `/v2/Rail/Metro/Alert/{RailSystem}` only accepts these 6 codes
 * (confirmed live 2026-10-13 against TDX's own OpenAPI document for the
 * 公共運輸-軌道 v2 group — the `RailSystem` path parameter's enum is exactly
 * `TYMC`, `KRTC`, `KLRT`, `TRTC`, `TRTCMG`, `TMRT`), matching
 * docs/2.0/spec-issue-438.md §P T4's list of "全台 6 個捷運／輕軌系統"
 * (TRTCMG = 貓空纜車, counted as its own system for this API even though it
 * shares an operator with TRTC). This does NOT include NTMC/NTDLRT/NTALRT
 * (新北捷運環狀線／淡海輕軌／安坑輕軌) — those have no Metro/Alert coverage
 * in TDX today (they do appear in the separate Senior/Rail accessibility API,
 * see lib/server/transit/railStationCounty.ts's wider RAIL_SYSTEMS list,
 * which is a different TDX service category entirely).
 */
export const METRO_ALERT_SYSTEMS: Array<{ code: RailAlertSystemCode; label: string }> = [
  { code: "TRTC", label: "臺北捷運" },
  { code: "TRTCMG", label: "貓空纜車" },
  { code: "TYMC", label: "桃園捷運" },
  { code: "TMRT", label: "臺中捷運" },
  { code: "KRTC", label: "高雄捷運" },
  { code: "KLRT", label: "高雄輕軌" },
];

/** All 8 rail alert sources this tool fans out across: the 6 metro/light-rail systems above, plus TRA and THSR (each on their own dedicated TDX endpoint, not the Metro/Alert path). */
export const RAIL_ALERT_SOURCES: Array<{ code: RailAlertSystemCode; label: string }> = [
  ...METRO_ALERT_SYSTEMS,
  { code: "TRA", label: "臺鐵" },
  { code: "THSR", label: "高鐵" },
];

const TDX_BASIC = "https://tdx.transportdata.tw/api/basic";

const metroAlertUrl = (code: string): string =>
  `${TDX_BASIC}/v2/Rail/Metro/Alert/${code}?%24format=JSON`;
const TRA_ALERT_URL = `${TDX_BASIC}/v3/Rail/TRA/Alert?%24format=JSON`;
const THSR_ALERT_URL = `${TDX_BASIC}/v2/Rail/THSR/AlertInfo?%24format=JSON`;

const sourceUrl = (code: RailAlertSystemCode): string => {
  if (code === "TRA") return TRA_ALERT_URL;
  if (code === "THSR") return THSR_ALERT_URL;
  return metroAlertUrl(code);
};

interface TdxAlertScopeStation {
  StationID?: string;
  StationName?: string;
}
interface TdxAlertScopeLine {
  LineID?: string;
  LineName?: string;
}
interface TdxAlertScopeRoute {
  RouteID?: string;
  RouteName?: string;
}
interface TdxAlertScopeNetwork {
  NetworkID?: string;
  NetworkName?: string;
}
interface TdxAlertScopeLineSection {
  StartingStationName?: string;
  EndingStationName?: string;
  Description?: string;
}
interface TdxAlertScope {
  NetworkList?: TdxAlertScopeNetwork;
  Stations?: TdxAlertScopeStation[];
  Lines?: TdxAlertScopeLine[];
  Routes?: TdxAlertScopeRoute[];
  LineSections?: TdxAlertScopeLineSection[];
}

/**
 * Confirmed live 2026-10-13 against TDX's own OpenAPI schema for
 * `/v3/Rail/TRA/Alert` (`components/schemas` …
 * `TRAAlertList.Alert`/`AlertScope*`). TDX's path descriptions for
 * `/v2/Rail/Metro/Alert/{RailSystem}` and `/v2/Rail/THSR/AlertInfo`
 * paraphrase the exact same field set (title, content, operating status,
 * impact level, cause, affected network/station/route/train/section, time,
 * responsible authority code) under the same `PTX.Service.DTO.Rail.Specification`
 * schema family, so this shape is reused for all three endpoints rather than
 * declaring 3 near-identical interfaces. Every field below is read
 * defensively in normalizeRailAlert() (optional chaining + fallbacks), so if
 * Metro's or THSR's *actual* live response differs in some field name, it
 * degrades to a shorter/plainer alert instead of throwing — this needs
 * confirming against a real TDX token post-deploy, same as every other TDX
 * integration in this repo (see lib/server/tdx/seniors.ts's history).
 */
interface TdxRailAlertItem {
  AlertID?: string;
  AlertUID?: string;
  Title?: string;
  Description?: string;
  /** 0 = 全線停駛, 1 = 正常, 2 = 異常/部分受影響 */
  Status?: number;
  /** 1 = 嚴重, 2 = 中度, 3 = 輕微 */
  Level?: number;
  Reason?: string;
  Effect?: string;
  StartTime?: string;
  EndTime?: string;
  PublishTime?: string;
  UpdateTime?: string;
  Scope?: TdxAlertScope;
}

/** Extracts the best available affected-station/line/route label from an Alert's Scope, in descending order of specificity. Returns "" when Scope is absent or empty — the UI falls back to a generic "全線" wording in that case. */
function scopeLabel(scope?: TdxAlertScope): string {
  if (!scope) return "";
  const stationNames = (scope.Stations || []).map((s) => s.StationName).filter(Boolean) as string[];
  if (stationNames.length > 0) return stationNames.join("、");

  const lineNames = (scope.Lines || []).map((l) => l.LineName).filter(Boolean) as string[];
  if (lineNames.length > 0) return lineNames.join("、");

  const routeNames = (scope.Routes || []).map((r) => r.RouteName).filter(Boolean) as string[];
  if (routeNames.length > 0) return routeNames.join("、");

  const sections = (scope.LineSections || [])
    .map((sec) => {
      if (sec.StartingStationName && sec.EndingStationName) {
        return `${sec.StartingStationName}－${sec.EndingStationName}`;
      }
      return sec.Description || "";
    })
    .filter(Boolean);
  if (sections.length > 0) return sections.join("、");

  return scope.NetworkList?.NetworkName || "";
}

/** 0 = 全線停駛 maps to "suspended" (most severe); everything else (normal updates included — TDX only publishes an Alert record when there's something to report) maps to "operational", matching the existing data.taipei-sourced rows' "operational" category for non-elevator alerts. */
function statusToAlertType(status?: number): MetroAlertItem["alertType"] {
  if (status === 0) return "suspended";
  return "operational";
}

/**
 * TDX date-time fields are typed `date-time` (ISO 8601) and may or may not
 * carry a `+08:00` offset. Extracting the leading `YYYY-MM-DDTHH:MM:SS`
 * digits directly (rather than round-tripping through `Date`/`toISOString`,
 * which would shift an offset-bearing value to UTC and silently desync from
 * every other row in this table, all stored as plain Taiwan wall-clock time)
 * keeps the displayed time exactly what TDX published.
 */
function formatTdxAlertTime(value?: string | null): string {
  if (value) {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** Normalizes one raw TDX rail alert item into this tool's shared MetroAlertItem shape, tagging it with the system it came from. */
export function normalizeRailAlert(
  item: TdxRailAlertItem,
  systemCode: RailAlertSystemCode,
  systemLabel: string,
): MetroAlertItem {
  const rawId =
    item.AlertID ||
    item.AlertUID ||
    crypto
      .createHash("md5")
      .update(`${systemCode}_${item.Title || ""}_${item.StartTime || ""}_${item.Description || ""}`)
      .digest("hex")
      .slice(0, 24);

  return {
    externalId: `${systemCode}_${rawId}`,
    lineName: systemLabel,
    stationName: scopeLabel(item.Scope),
    alertTitle: item.Title || `${systemLabel}營運公告`,
    alertContent: item.Description || item.Effect || item.Reason || "",
    alertType: statusToAlertType(item.Status),
    alertTime: formatTdxAlertTime(item.UpdateTime || item.PublishTime || item.StartTime),
    status: "active",
    systemCode,
    systemLabel,
  };
}

async function fetchRailAlertSystem(
  code: RailAlertSystemCode,
  token: string,
): Promise<TdxRailAlertItem[]> {
  const res = await tdxGetJsonWithRetry<TdxRailAlertItem[]>(sourceUrl(code), token, { timeoutMs: 12000 });
  if (res.status !== 200 || !Array.isArray(res.data)) {
    throw new Error(`TDX rail alert endpoint for ${code} returned status ${res.status}`);
  }
  return res.data;
}

/** Fetches and normalizes one rail alert source's data. Throws on failure so the caller's Promise.allSettled fan-out can isolate it — never returns a partial/guessed result. */
export async function fetchRailAlertsForSystem(
  code: RailAlertSystemCode,
  label: string,
  token: string,
): Promise<MetroAlertItem[]> {
  const items = await fetchRailAlertSystem(code, token);
  return items.map((item) => normalizeRailAlert(item, code, label));
}

export interface RailAlertsFanOutResult {
  alerts: MetroAlertItem[];
  bySystem: Record<string, number>;
  errors: Record<string, string>;
}

/**
 * Fans out across all 8 RAIL_ALERT_SOURCES (6 metro/light-rail systems + TRA
 * + THSR) via Promise.allSettled, in batches of 4 to stay within TDX's
 * per-second rate limit (same convention as
 * lib/server/transit/tdxBusClient.ts's fetchAllTdxBusRoutes()). One source's
 * failure (timeout, non-200, a schema TDX didn't document the way we
 * guessed) is recorded into `errors[code]` and that source simply
 * contributes 0 alerts this round — it never aborts, delays, or discards
 * any other source's already-fetched data (issue #470 acceptance criterion
 * 4).
 *
 * When no token can be obtained at all (`getTdxToken()` returns null both
 * when credentials are unset AND when the token request itself transiently
 * fails — see lib/server/tdx/auth.ts), every source is recorded into
 * `errors` rather than silently returning an all-empty "success" result.
 * This matters because the caller (runMetroAlertsSync -> resolveStaleAlerts)
 * uses an EMPTY `errors[code]` as its signal that a system was actually
 * checked this round and had nothing to report, and resolves ("目前無通阻")
 * any of that system's previously-active rows on that basis. A transient
 * TDX auth hiccup is not "nothing to report" — treating it that way would
 * falsely clear every currently-active disruption across all 8 systems
 * (including on "颱風地震來了", the one guide page whose whole point is
 * surfacing exactly this), until the next successful sync 30 minutes later.
 */
export async function fetchAllRailAlerts(): Promise<RailAlertsFanOutResult> {
  const bySystem: Record<string, number> = {};
  const errors: Record<string, string> = {};
  const alerts: MetroAlertItem[] = [];

  const token = await getTdxToken();
  if (!token) {
    for (const source of RAIL_ALERT_SOURCES) {
      bySystem[source.code] = 0;
      errors[source.code] = "TDX token unavailable (not configured, or the token request itself failed)";
    }
    return { alerts, bySystem, errors };
  }

  const batchSize = 4;
  for (let i = 0; i < RAIL_ALERT_SOURCES.length; i += batchSize) {
    const batch = RAIL_ALERT_SOURCES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((s) => fetchRailAlertsForSystem(s.code, s.label, token)),
    );

    for (let j = 0; j < batch.length; j++) {
      const { code } = batch[j];
      const result = results[j];
      if (result.status === "fulfilled") {
        bySystem[code] = result.value.length;
        alerts.push(...result.value);
      } else {
        bySystem[code] = 0;
        errors[code] = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }
  }

  return { alerts, bySystem, errors };
}
