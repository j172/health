import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署 (WRA) 開放資料平臺 — 河川水位測站站況 (dataset/22227).
// Confirmed live (2026-09-09): no `api_key` param needed.
// Provides official Chinese station name, river, address, alert levels, and status for station_id.
const WATER_LEVEL_STATION_CATALOG_URL =
  "https://opendata.wra.gov.tw/api/v2/c4acc691-7416-40ca-9464-292c0c00da92";
const FETCH_LIMIT = 5000;

export interface WaterLevelStationCatalogRecord {
  stationId: string;
  stationName: string;
  observatoryIdentifier: string | null;
  riverName: string | null;
  locationAddress: string | null;
  alertLevel1: number | null;
  alertLevel2: number | null;
  alertLevel3: number | null;
  areaCode: string | null;
  basinCode: string | null;
  observationStatus: string | null;
}

const cleanStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

export async function fetchWaterLevelStationCatalog(): Promise<WaterLevelStationCatalogRecord[]> {
  const url = `${WATER_LEVEL_STATION_CATALOG_URL}?sort=${encodeURIComponent("_importdate asc")}&format=JSON&limit=${FETCH_LIMIT}`;
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) {
    throw new Error(`WRA water level station catalog request failed: HTTP ${status}`);
  }

  const data = JSON.parse(text);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return rows
    .map((rec): WaterLevelStationCatalogRecord | null => {
      // Station identifier is in basinidentifier or stationid
      const stationId = cleanStr(rec.basinidentifier ?? rec.stationid ?? rec.station_id);
      const stationName = cleanStr(rec.observatoryname ?? rec.stationname ?? rec.station_name);
      if (!stationId || !stationName) return null;

      return {
        stationId,
        stationName,
        observatoryIdentifier: cleanStr(rec.observatoryidentifier ?? rec.observatory_identifier),
        riverName: cleanStr(rec.rivername ?? rec.river_name),
        locationAddress: cleanStr(rec.locationaddress ?? rec.location_address),
        alertLevel1: parseNum(rec.alertlevel1),
        alertLevel2: parseNum(rec.alertlevel2),
        alertLevel3: parseNum(rec.alertlevel3),
        areaCode: cleanStr(rec.areacode ?? rec.area_code),
        basinCode: cleanStr(rec.affiliatedbasin ?? rec.basin_code),
        observationStatus: cleanStr(rec.observationstatus ?? rec.observation_status),
      };
    })
    .filter((r): r is WaterLevelStationCatalogRecord => r !== null);
}
