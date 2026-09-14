import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署水資源物聯網 (iot.wra.gov.tw) — 堤防結構安全監測站, issue #270.
// Confirmed live (2026-09-15): no API key required, plain GET returns JSON
// directly. Unlike opendata.wra.gov.tw's `api/v2/<dataset-id>` convention,
// this is iot.wra.gov.tw's own REST API — its swagger doc
// (https://iot.wra.gov.tw/swagger/v1/swagger.json) titles it "水利署 水文開放
//資料 API" v2, but the paths themselves carry NO version prefix: the real
// endpoint is https://iot.wra.gov.tw/damstructure/stations, not
// /v2/damstructure/stations (that guess 404s). Sample verified live:
// 白布帆堤防 (StationId A130613RV017), Latitude 24.2953.
//
// Licensing note (see PR description for the full writeup): the swagger
// `info` block carries only `title`/`version`, no `license` field, and
// iot.wra.gov.tw's own footer/pages surface no open-data licence statement
// either. This module assumes the same 政府資料開放授權條款 posture as the
// sibling opendata.wra.gov.tw sources in this file's directory, but that is
// an assumption, not a confirmed fact.
const DAM_STRUCTURE_STATIONS_URL = "https://iot.wra.gov.tw/damstructure/stations";

export interface DamStructureMeasurement {
  name: string;
  fullName: string | null;
  unit: string | null;
  value: number | null;
  /** MySQL DATETIME string, parsed from the source's "+08:00"-suffixed ISO timestamp. */
  timestamp: string | null;
}

export interface DamStructureStationRecord {
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
  measurements: DamStructureMeasurement[];
  /** Max timestamp across this station's measurements, MySQL DATETIME string. */
  recordedAt: string | null;
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

// Source ships e.g. "2026-09-14T23:07:55+08:00" — already Taipei local time
// with an explicit +08:00 offset (unlike opendata.wra.gov.tw's offset-less
// "datetime" field elsewhere in this directory). Strip the offset and
// normalize the "T" to a space for MySQL DATETIME.
const toMysqlDatetime = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
};

export async function fetchDamStructureStations(): Promise<DamStructureStationRecord[]> {
  const { status, text } = await httpGetText(DAM_STRUCTURE_STATIONS_URL, { timeoutMs: 20_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`WRA IoT damstructure/stations request failed: HTTP ${status}`);
  }

  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows)) return [];

  return (rows as Record<string, unknown>[])
    .map((rec): DamStructureStationRecord | null => {
      const stationId = cleanStr(rec.StationId);
      const name = cleanStr(rec.Name);
      const lat = parseNum(rec.Latitude);
      // "Longtiude" is the source's own field-name typo, not ours.
      const lng = parseNum(rec.Longtiude);
      if (!stationId || !name || lat === null || lng === null) return null;

      const rawMeasurements = Array.isArray(rec.Measurements) ? rec.Measurements : [];
      const measurements: DamStructureMeasurement[] = rawMeasurements.map(
        (m: Record<string, unknown>): DamStructureMeasurement => ({
          name: cleanStr(m.Name) ?? "",
          fullName: cleanStr(m.FullName),
          unit: cleanStr(m.SIUnit),
          value: parseNum(m.Value),
          timestamp: toMysqlDatetime(m.TimeStamp),
        }),
      );

      const recordedAt = measurements.reduce<string | null>((latest, m) => {
        if (!m.timestamp) return latest;
        return !latest || m.timestamp > latest ? m.timestamp : latest;
      }, null);

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
        measurements,
        recordedAt,
      };
    })
    .filter((r): r is DamStructureStationRecord => r !== null);
}
