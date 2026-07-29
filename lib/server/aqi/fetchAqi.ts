import { httpGetText } from "@/lib/server/net/httpClient";

// 環境部開放資料平臺 — 資料集 AQX_P_432（全台空氣品質即時資料）
const MOENV_AQI_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432";

export interface AqiSiteSnapshot {
  siteId: string;
  siteName: string;
  county: string;
  lat: number | null;
  lng: number | null;
  aqiValue: number | null;
  aqiStatus: string | null;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS"), parsed from MOENV's "publishtime". */
  recordedAt: string | null;
}

const parseNum = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// MOENV ships "publishtime" as "2026/07/29 19:00:00" (slashes, no timezone —
// it's already Taipei local time, same convention as the rest of this app's
// *_at_taipei columns).
const toMysqlDatetime = (publishtime: unknown): string | null => {
  const s = String(publishtime ?? "").trim();
  if (!s) return null;
  return s.replace(/\//g, "-");
};

export async function fetchAqiSites(): Promise<AqiSiteSnapshot[]> {
  const apiKey = process.env.MOENV_AQI_API_KEY;
  if (!apiKey) {
    throw new Error("MOENV_AQI_API_KEY is not configured");
  }

  const url = `${MOENV_AQI_URL}?format=json&limit=1000&api_key=${encodeURIComponent(apiKey)}`;
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`MOENV AQI request failed: HTTP ${status}`);

  const data = JSON.parse(text);
  const records: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return records
    .map((rec): AqiSiteSnapshot | null => {
      const siteName = String(rec.sitename ?? "");
      const recordedAt = toMysqlDatetime(rec.publishtime);
      if (!siteName || !recordedAt) return null;
      return {
        siteId: String(rec.siteid ?? ""),
        siteName,
        county: String(rec.county ?? ""),
        lat: parseNum(rec.latitude),
        lng: parseNum(rec.longitude),
        aqiValue: parseNum(rec.aqi),
        aqiStatus: rec.status ? String(rec.status) : null,
        pm25: parseNum(rec["pm2.5"]),
        pm10: parseNum(rec.pm10),
        o3: parseNum(rec.o3),
        no2: parseNum(rec.no2),
        so2: parseNum(rec.so2),
        co: parseNum(rec.co),
        recordedAt,
      };
    })
    .filter((s): s is AqiSiteSnapshot => s !== null);
}
