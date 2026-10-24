import { getRailSystemLabel } from "./topics.ts";

export interface NormalizedRailAlert {
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

function parseRawPayload(rawInput: unknown): unknown {
  if (typeof rawInput === "string") {
    try {
      return JSON.parse(rawInput);
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(rawInput)) {
    try {
      return JSON.parse(rawInput.toString("utf8"));
    } catch {
      return null;
    }
  }
  return rawInput;
}

function determineSeverity(
  statusVal: unknown,
  text: string,
): "info" | "warning" | "alert" {
  const statusStr = String(statusVal ?? "");
  if (statusStr === "2") return "alert";
  if (statusStr === "1") return "warning";
  if (statusStr === "0") return "info";

  if (/停駛|中斷|脫軌|暫停營運|運轉中止|封閉/i.test(text)) {
    return "alert";
  }
  if (/延誤|慢行|運轉變更|降速|故障|異常/i.test(text)) {
    return "warning";
  }
  return "info";
}

/**
 * Parses and normalizes incoming TDX V3 TRA (Taiwan Railway) alert payloads.
 * Expected schema: AlertID, Title, Description, PublishTime, StartTime, EndTime, Scope
 */
export function parseAndNormalizeTraAlert(rawInput: unknown): NormalizedRailAlert[] {
  const parsed = parseRawPayload(rawInput);
  if (!parsed) return [];

  let items: any[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    if (Array.isArray((parsed as any).Alerts)) {
      items = (parsed as any).Alerts;
    } else {
      items = [parsed];
    }
  }

  const results: NormalizedRailAlert[] = [];
  const systemCode = "TRA";
  const systemLabel = getRailSystemLabel(systemCode);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const alertId = item.AlertID || item.id || item.alert_id;
    if (!alertId) continue;

    const title = resolveText(item.Title) || resolveText(item.AlertTitle) || "";
    const description =
      resolveText(item.Description) ||
      resolveText(item.AlertContent) ||
      resolveText(item.Content) ||
      title ||
      "臺鐵營運通報";
    const reason = item.Reason || title || "營運通報";

    let stationId = item.StationID || "";
    let stationName = resolveText(item.StationName);

    if (!stationId && item.Scope?.Stations && item.Scope.Stations.length > 0) {
      const firstStation = item.Scope.Stations[0];
      stationId = firstStation.StationID || "";
      stationName = resolveText(firstStation.StationName) || stationId;
    }

    if (!stationId && item.Scope?.LineSections && item.Scope.LineSections.length > 0) {
      const section = item.Scope.LineSections[0];
      const fromName = resolveText(section.FromStationName) || section.FromStationID || "";
      const toName = resolveText(section.ToStationName) || section.ToStationID || "";
      if (fromName && toName) {
        stationName = `${fromName} 至 ${toName}`;
      } else {
        stationName = fromName || toName || "";
      }
      stationId = section.FromStationID || section.LineID || "";
    }

    let lineId = item.LineID || null;
    let lineName = resolveText(item.LineName) || null;
    if (!lineId && item.Scope?.Lines && item.Scope.Lines.length > 0) {
      lineId = item.Scope.Lines[0].LineID || null;
      lineName = resolveText(item.Scope.Lines[0].LineName) || null;
    }

    const startTime = toSqlDateTime(item.StartTime);
    const endTime = toSqlDateTime(item.EndTime);
    const publishTime =
      toSqlDateTime(item.PublishTime || item.UpdateTime) ||
      toSqlDateTime(new Date().toISOString());

    const combinedText = `${title} ${description} ${reason}`;
    const severity = determineSeverity(item.Effect ?? item.Status, combinedText);

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
      severity,
      startTime,
      endTime,
      publishTime,
    });
  }

  return results;
}

/**
 * Parses and normalizes incoming TDX V2 THSR (High Speed Rail) alert payloads.
 * Expected schema: AlertID / AlertInfo, Title, Description, PublishTime, StartTime, EndTime, Status
 */
export function parseAndNormalizeThsrAlert(rawInput: unknown): NormalizedRailAlert[] {
  const parsed = parseRawPayload(rawInput);
  if (!parsed) return [];

  let items: any[] = [];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    if (Array.isArray((parsed as any).AlertInfo)) {
      items = (parsed as any).AlertInfo;
    } else if (Array.isArray((parsed as any).AlertInfos)) {
      items = (parsed as any).AlertInfos;
    } else if (Array.isArray((parsed as any).Alerts)) {
      items = (parsed as any).Alerts;
    } else {
      items = [parsed];
    }
  }

  const results: NormalizedRailAlert[] = [];
  const systemCode = "THSR";
  const systemLabel = getRailSystemLabel(systemCode);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const alertId =
      item.AlertID ||
      (typeof item.AlertInfo === "string" ? item.AlertInfo : null) ||
      item.id ||
      item.alert_id;
    if (!alertId) continue;

    const title =
      resolveText(item.Title) ||
      resolveText(item.AlertTitle) ||
      resolveText(item.SubTitle) ||
      "";
    const description =
      resolveText(item.Description) ||
      resolveText(item.AlertContent) ||
      resolveText(item.Content) ||
      title ||
      "高鐵營運通報";
    const reason = item.Reason || title || "營運通報";

    let stationId = item.StationID || "";
    let stationName = resolveText(item.StationName);

    if (!stationId && item.Scope?.Stations && item.Scope.Stations.length > 0) {
      const firstStation = item.Scope.Stations[0];
      stationId = firstStation.StationID || "";
      stationName = resolveText(firstStation.StationName) || stationId;
    }

    let lineId = item.LineID || null;
    let lineName = resolveText(item.LineName) || null;
    if (!lineId && item.Scope?.Lines && item.Scope.Lines.length > 0) {
      lineId = item.Scope.Lines[0].LineID || null;
      lineName = resolveText(item.Scope.Lines[0].LineName) || null;
    }

    const startTime = toSqlDateTime(item.StartTime);
    const endTime = toSqlDateTime(item.EndTime);
    const publishTime =
      toSqlDateTime(item.PublishTime || item.UpdateTime) ||
      toSqlDateTime(new Date().toISOString());

    const combinedText = `${title} ${description} ${reason}`;
    const severity = determineSeverity(item.Status ?? item.Effect, combinedText);

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
      severity,
      startTime,
      endTime,
      publishTime,
    });
  }

  return results;
}
