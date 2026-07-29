import { httpGetText } from "@/lib/server/net/httpClient";

// 環境部開放資料平臺 — 資料集 AQX_P_02（細懸浮微粒 PM2.5 即時資料）
const MOENV_PM25_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_02";

export interface Pm25SiteSnapshot {
  siteName: string;
  county: string;
  pm25: number | null;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS"), parsed from MOENV's "datacreationdate". */
  recordedAt: string | null;
}

const parseNum = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// MOENV ships "datacreationdate" as "2026-07-29 22:00" (no seconds, but
// already Taipei local time, same convention as this app's other *_at columns).
const toMysqlDatetime = (datacreationdate: unknown): string | null => {
  const s = String(datacreationdate ?? "").trim();
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
};

export async function fetchPm25Sites(): Promise<Pm25SiteSnapshot[]> {
  const apiKey = process.env.MOENV_PM25_API_KEY;
  if (!apiKey) {
    throw new Error("MOENV_PM25_API_KEY is not configured");
  }

  const url = `${MOENV_PM25_URL}?format=JSON&limit=1000&sort=${encodeURIComponent("datacreationdate desc")}&api_key=${encodeURIComponent(apiKey)}`;
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) throw new Error(`MOENV PM2.5 request failed: HTTP ${status}`);

  const data = JSON.parse(text);
  const records: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return records
    .map((rec): Pm25SiteSnapshot | null => {
      const siteName = String(rec.site ?? "");
      const recordedAt = toMysqlDatetime(rec.datacreationdate);
      if (!siteName || !recordedAt) return null;
      return {
        siteName,
        county: String(rec.county ?? ""),
        pm25: parseNum(rec.pm25),
        recordedAt,
      };
    })
    .filter((s): s is Pm25SiteSnapshot => s !== null);
}
