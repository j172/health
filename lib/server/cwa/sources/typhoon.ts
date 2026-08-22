import { createHash } from "node:crypto";
import { fetchCwaDataset } from "@/lib/server/cwa/client";
import type { CwaAlertRecord } from "@/lib/server/cwa/queries";

/**
 * 颱風消息與熱帶性低氣壓 (W-C0034-005) as alert rows.
 *
 * Unlike the W-C0033-* / W-C0034-001 datasets this is not CAP — it is cyclone
 * track data: every active system in the West Pacific and South China Sea with
 * its past fixes and its forecast track. It is folded into cwa_alerts anyway so
 * the 即時氣象警報 block has one query and one shape to render.
 *
 * The two derived fields are the interesting part:
 *
 * - `severity` comes from the latest fix's MaxWindSpeed, using CWA's own
 *   classification thresholds, so a 強烈颱風 outranks a 輕度颱風 in the widget's
 *   ordering rather than every cyclone looking equally urgent.
 * - `expires` is the end of the forecast track (InitialTime + the largest
 *   ForecastHour). That matters because a cyclone has no "cancelled" bulletin:
 *   it simply stops appearing in the feed. Anchoring expiry to the forecast
 *   horizon lets a dissipated system age out on its own instead of relying on
 *   the seven-day catch-all.
 */

const RESOURCE_ID = "W-C0034-005";

interface RawFix {
  DateTime?: string;
  InitialTime?: string;
  ForecastHour?: string;
  CoordinateLongitude?: string;
  CoordinateLatitude?: string;
  MaxWindSpeed?: string;
  MaxGustSpeed?: string;
  Pressure?: string;
  MovingSpeed?: string;
  MovingDirection?: string;
}

interface RawCyclone {
  Year?: string;
  TyphoonName?: string;
  CwaTyphoonName?: string;
  CwaTdNo?: string;
  CwaTyNo?: string;
  AnalysisData?: { Fix?: RawFix[] };
  ForecastData?: { Fix?: RawFix[] };
}

interface RawRecords {
  TropicalCyclones?: { TropicalCyclone?: RawCyclone[] };
}

const num = (value: unknown): number | null => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * CWA's intensity bands, in m/s of ten-minute sustained wind, mapped onto CAP
 * severity so one ordering covers every alert in the widget.
 */
const classify = (
  windMs: number | null,
): { label: string; severity: string } => {
  if (windMs === null) return { label: "熱帶氣旋", severity: "Minor" };
  if (windMs >= 51.0) return { label: "強烈颱風", severity: "Extreme" };
  if (windMs >= 32.7) return { label: "中度颱風", severity: "Severe" };
  if (windMs >= 17.2) return { label: "輕度颱風", severity: "Moderate" };
  return { label: "熱帶性低氣壓", severity: "Minor" };
};

/** CWA publishes +08:00 timestamps; store them as UTC DATETIME strings. */
const toSqlUtc = (value: string | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const forecastEnd = (forecast: RawFix[]): string | null => {
  let latest: number | null = null;
  for (const fix of forecast) {
    const initial = fix.InitialTime ? new Date(fix.InitialTime).getTime() : NaN;
    const hours = num(fix.ForecastHour);
    if (!Number.isFinite(initial) || hours === null) continue;
    const end = initial + hours * 3600_000;
    if (latest === null || end > latest) latest = end;
  }
  if (latest === null) return null;
  return new Date(latest).toISOString().slice(0, 19).replace("T", " ");
};

export async function fetchCwaTyphoons(): Promise<CwaAlertRecord[]> {
  const records = await fetchCwaDataset<RawRecords>(RESOURCE_ID);
  const cyclones = records?.TropicalCyclones?.TropicalCyclone ?? [];
  const rows: CwaAlertRecord[] = [];

  for (const cyclone of cyclones) {
    const analysis = cyclone.AnalysisData?.Fix ?? [];
    const forecast = cyclone.ForecastData?.Fix ?? [];
    const latest = analysis[analysis.length - 1];
    if (!latest) continue;

    const wind = num(latest.MaxWindSpeed);
    const { label, severity } = classify(wind);

    // 沙德爾 (SAUDEL) / 熱帶性低氣壓 TD22 — a TD has no name, only a number.
    const chineseName = (cyclone.CwaTyphoonName || "").trim();
    const englishName = (cyclone.TyphoonName || "").trim();
    const typhoonNo = (cyclone.CwaTyNo || "").trim();
    const tdNo = (cyclone.CwaTdNo || "").trim();
    const identity = chineseName
      ? `${chineseName}${englishName ? ` (${englishName})` : ""}${typhoonNo ? ` 第${typhoonNo}號` : ""}`
      : `TD${tdNo || "?"}`;

    const effective = toSqlUtc(latest.DateTime);
    const position = [
      latest.CoordinateLatitude ? `北緯 ${latest.CoordinateLatitude}°` : "",
      latest.CoordinateLongitude ? `東經 ${latest.CoordinateLongitude}°` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    const detail = [
      wind !== null ? `近中心最大風速 ${wind} m/s` : "",
      latest.MaxGustSpeed ? `陣風 ${latest.MaxGustSpeed} m/s` : "",
      latest.Pressure ? `中心氣壓 ${latest.Pressure} hPa` : "",
      latest.MovingDirection && latest.MovingSpeed
        ? `以每小時 ${latest.MovingSpeed} 公里向${latest.MovingDirection}移動`
        : "",
    ]
      .filter(Boolean)
      .join("，");

    rows.push({
      alertKey: createHash("sha256")
        .update(`${RESOURCE_ID}|${identity}|${effective ?? ""}`)
        .digest("hex"),
      datasetId: RESOURCE_ID,
      event: `${label} ${identity}`,
      headline: detail || null,
      description: [position, detail].filter(Boolean).join("｜") || null,
      instruction: null,
      severity,
      // Track data is an observation of something already happening, and the
      // position is measured rather than predicted.
      urgency: "Expected",
      certainty: "Observed",
      areaDesc: position || null,
      effective,
      onset: effective,
      expires: forecastEnd(forecast),
      web: "https://www.cwa.gov.tw/V8/C/P/Typhoon/Typhoon.html",
    });
  }

  return rows;
}
