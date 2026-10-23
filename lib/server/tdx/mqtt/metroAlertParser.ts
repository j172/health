import { getRailSystemLabel } from "./topics.ts";

export interface TdxMetroAlertScope {
  Lines?: Array<{
    LineID?: string;
    LineName?: { Zh_tw?: string; En?: string } | string;
  }>;
  Stations?: Array<{
    StationID?: string;
    StationName?: { Zh_tw?: string; En?: string } | string;
  }>;
}

export interface TdxMetroAlertRaw {
  AlertID?: string;
  OperatorID?: string;
  RailSystem?: string;
  Title?: string;
  AlertTitle?: string;
  Description?: string;
  AlertContent?: string;
  Reason?: string;
  Status?: number | string;
  Effect?: number | string;
  Scope?: TdxMetroAlertScope;
  StationID?: string;
  StationName?: { Zh_tw?: string; En?: string } | string;
  LineID?: string;
  LineName?: { Zh_tw?: string; En?: string } | string;
  StartTime?: string;
  EndTime?: string;
  PublishTime?: string;
  UpdateTime?: string;
}

export interface NormalizedMetroAlert {
  alertId: string;
  railSystem: string;
  systemLabel: string;
  stationId: string;
  stationName: string;
  lineId?: string | null;
  lineName?: string | null;
  reason: string;
  description: string;
  severity: "info" | "warning" | "alert";
  startTime: string | null;
  endTime: string | null;
  publishTime: string | null;
}

function resolveText(val?: { Zh_tw?: string; En?: string } | string | null): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val.Zh_tw || val.En || "";
}

export function toSqlDateTime(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Determine alert severity based on Effect / Status or keyword content.
 * Effect: 0: Informational, 1: Warning/Delay, 2: Suspension/Major disruption
 */
function determineSeverity(raw: TdxMetroAlertRaw): "info" | "warning" | "alert" {
  const effect = String(raw.Effect ?? raw.Status ?? "");
  if (effect === "0") return "info";
  if (effect === "2") return "alert";
  if (effect === "1") return "warning";

  const text = `${raw.Title || ""} ${raw.Description || ""} ${raw.Reason || ""}`;
  if (/停駛|中斷|脫軌|暫停營運|封閉/i.test(text)) {
    return "alert";
  }
  if (/延誤|慢行|故障|異常/i.test(text)) {
    return "warning";
  }
  return "info";
}

/**
 * Parses and normalizes incoming TDX Metro alert message payloads.
 * Handles both JSON arrays and single objects, as well as nested Scopes.
 */
export function parseAndNormalizeMetroAlert(
  rawInput: unknown,
  fallbackSystem?: string | null,
): NormalizedMetroAlert[] {
  let parsed: unknown = rawInput;

  if (typeof rawInput === "string") {
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return [];
    }
  } else if (Buffer.isBuffer(rawInput)) {
    try {
      parsed = JSON.parse(rawInput.toString("utf8"));
    } catch {
      return [];
    }
  }

  const items: TdxMetroAlertRaw[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
    ? [parsed as TdxMetroAlertRaw]
    : [];

  const results: NormalizedMetroAlert[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const alertId = item.AlertID || (item as any).id || (item as any).alert_id;
    if (!alertId) continue;

    const systemCode = (
      item.RailSystem ||
      item.OperatorID ||
      fallbackSystem ||
      "TRTC"
    ).toUpperCase();
    const systemLabel = getRailSystemLabel(systemCode);

    // Extract station information: direct or from Scope
    let stationId = item.StationID || "";
    let stationName = resolveText(item.StationName);

    if (!stationId && item.Scope?.Stations && item.Scope.Stations.length > 0) {
      const firstStation = item.Scope.Stations[0];
      stationId = firstStation.StationID || "";
      stationName = resolveText(firstStation.StationName) || stationId;
    }

    // Extract line information
    let lineId = item.LineID || null;
    let lineName = resolveText(item.LineName) || null;
    if (!lineId && item.Scope?.Lines && item.Scope.Lines.length > 0) {
      lineId = item.Scope.Lines[0].LineID || null;
      lineName = resolveText(item.Scope.Lines[0].LineName) || null;
    }

    const title = item.Title || item.AlertTitle || "";
    const reason = item.Reason || title || "營運通報";
    const description = item.Description || item.AlertContent || title || reason;

    const startTime = toSqlDateTime(item.StartTime);
    const endTime = toSqlDateTime(item.EndTime);
    const publishTime = toSqlDateTime(item.PublishTime || item.UpdateTime) || toSqlDateTime(new Date().toISOString());

    results.push({
      alertId: String(alertId),
      railSystem: systemCode,
      systemLabel,
      stationId: stationId || "ALL",
      stationName: stationName || (stationId ? stationId : `${systemLabel}全線`),
      lineId,
      lineName,
      reason,
      description,
      severity: determineSeverity(item),
      startTime,
      endTime,
      publishTime,
    });
  }

  return results;
}
