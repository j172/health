import { httpGetText } from "@/lib/server/net/httpClient";

// 環境部開放資料平臺 — 資料集 AQF_P_01（空氣品質預測，10 個空品區 × 未來數日）
const MOENV_AQI_FORECAST_URL = "https://data.moenv.gov.tw/api/v2/aqf_p_01";

export interface AqiForecastSnapshot {
  zone: string;
  /** MySQL DATE string ("YYYY-MM-DD"). */
  forecastDate: string;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS"). */
  publishTime: string;
  aqiValue: number | null;
  majorPollutant: string | null;
  minorPollutant: string | null;
  minorPollutantAqi: string | null;
  content: string | null;
}

const parseNum = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

const nullify = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

// MOENV ships "publishtime" as "2026-07-29 22:00" (no seconds, already
// Taipei local time, same convention as this app's other *_at columns).
const toMysqlDatetime = (publishtime: unknown): string | null => {
  const s = String(publishtime ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
};

export async function fetchAqiForecasts(): Promise<AqiForecastSnapshot[]> {
  const apiKey = process.env.MOENV_AQI_FORECAST_API_KEY;
  if (!apiKey) {
    throw new Error("MOENV_AQI_FORECAST_API_KEY is not configured");
  }

  const url = `${MOENV_AQI_FORECAST_URL}?format=JSON&limit=1000&sort=${encodeURIComponent("publishtime desc")}&api_key=${encodeURIComponent(apiKey)}`;
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`MOENV AQI forecast request failed: HTTP ${status}`);

  const data = JSON.parse(text);
  const records: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return records
    .map((rec): AqiForecastSnapshot | null => {
      const zone = String(rec.area ?? "");
      const forecastDate = String(rec.forecastdate ?? "");
      const publishTime = toMysqlDatetime(rec.publishtime);
      if (!zone || !forecastDate || !publishTime) return null;
      return {
        zone,
        forecastDate,
        publishTime,
        aqiValue: parseNum(rec.aqi),
        majorPollutant: nullify(rec.majorpollutant),
        minorPollutant: nullify(rec.minorpollutant),
        minorPollutantAqi: nullify(rec.minorpollutantaqi),
        content: nullify(rec.content),
      };
    })
    .filter((s): s is AqiForecastSnapshot => s !== null);
}
