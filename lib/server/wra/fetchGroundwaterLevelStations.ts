import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署水資源物聯網 (iot.wra.gov.tw) — 地下水位監測站, issue #270.
// Confirmed live (2026-09-15): no API key required, plain GET returns JSON
// directly. Same base API as fetchDamStructureStations.ts — no version
// prefix in the path (https://iot.wra.gov.tw/groundwaterlevel/stations, not
// /v2/groundwaterlevel/stations). Sample verified live: 金門高中
// (StationId A130600GW0703), 地下水位 3.997m, TimeStamp 2026-09-15T02:40:00+08:00.
//
// Licensing note: see fetchDamStructureStations.ts's comment (same swagger
// doc, same unconfirmed-licence posture) and the PR description.
const GROUNDWATER_STATIONS_URL = "https://iot.wra.gov.tw/groundwaterlevel/stations";

export interface GroundwaterMeasurement {
  name: string;
  fullName: string | null;
  unit: string | null;
  value: number | null;
  timestamp: string | null;
}

export interface GroundwaterStationRecord {
  stationId: string;
  iowStationId: string | null;
  name: string;
  countyCode: string | null;
  countyName: string | null;
  townCode: string | null;
  townName: string | null;
  adminName: string | null;
  lat: number;
  lng: number;
  /** The station's 地下水位 reading in meters, flattened out of Measurements. */
  waterLevelM: number | null;
  /** MySQL DATETIME string, parsed from the 地下水位 measurement's timestamp. */
  recordedAt: string | null;
  measurements: GroundwaterMeasurement[];
}

const cleanStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Same "+08:00"-suffixed ISO convention as fetchDamStructureStations.ts.
const toMysqlDatetime = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
};

export async function fetchGroundwaterLevelStations(): Promise<GroundwaterStationRecord[]> {
  const { status, text } = await httpGetText(GROUNDWATER_STATIONS_URL, { timeoutMs: 20_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`WRA IoT groundwaterlevel/stations request failed: HTTP ${status}`);
  }

  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows)) return [];

  return (rows as Record<string, unknown>[])
    .map((rec): GroundwaterStationRecord | null => {
      const stationId = cleanStr(rec.StationId);
      const name = cleanStr(rec.Name);
      const lat = parseNum(rec.Latitude);
      const lng = parseNum(rec.Longtiude); // sic — source's own field-name typo
      if (!stationId || !name || lat === null || lng === null) return null;

      const rawMeasurements = Array.isArray(rec.Measurements) ? rec.Measurements : [];
      const measurements: GroundwaterMeasurement[] = rawMeasurements.map(
        (m: Record<string, unknown>): GroundwaterMeasurement => ({
          name: cleanStr(m.Name) ?? "",
          fullName: cleanStr(m.FullName),
          unit: cleanStr(m.SIUnit),
          value: parseNum(m.Value),
          timestamp: toMysqlDatetime(m.TimeStamp),
        }),
      );

      const primary =
        measurements.find((m) => m.name === "地下水位" || (m.fullName ?? "").includes("地下水位")) ??
        measurements[0] ??
        null;

      return {
        stationId,
        iowStationId: cleanStr(rec.IoWStationId),
        name,
        countyCode: cleanStr(rec.CountyCode),
        countyName: cleanStr(rec.CountyName),
        townCode: cleanStr(rec.TownCode),
        townName: cleanStr(rec.TownName),
        adminName: cleanStr(rec.AdminName),
        lat,
        lng,
        waterLevelM: primary?.value ?? null,
        recordedAt: primary?.timestamp ?? null,
        measurements,
      };
    })
    .filter((r): r is GroundwaterStationRecord => r !== null);
}
