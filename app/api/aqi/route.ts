import { NextRequest, NextResponse } from "next/server";
import { httpGetText } from "@/lib/server/net/httpClient";

export const runtime = "nodejs";

// 環境部開放資料平臺 — 資料集 AQX_P_432（全台空氣品質即時資料）
const MOENV_AQI_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432";

export interface AqiSite {
  siteId: string;
  siteName: string;
  county: string;
  aqiValue: number | null;
  aqiStatus: string;
  aqiColor: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  recordedAt: string | null;
}

function getStatusAndColor(aqi: number | null): { status: string; color: string } {
  if (aqi === null) return { status: "–", color: "#9ca3af" };
  if (aqi <= 50) return { status: "良好", color: "#22c55e" };
  if (aqi <= 100) return { status: "普通", color: "#eab308" };
  if (aqi <= 150) return { status: "對敏感族群不健康", color: "#f97316" };
  if (aqi <= 200) return { status: "對所有族群不健康", color: "#ef4444" };
  if (aqi <= 300) return { status: "非常不健康", color: "#8b5cf6" };
  return { status: "危害", color: "#7f1d1d" };
}

const parseNum = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// In-memory cache — AQI data updates roughly hourly, so a per-process cache
// keeps us well within the free API's rate limits.
let cache: { sites: AqiSite[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchAllSites(): Promise<AqiSite[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.sites;

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

  const sites: AqiSite[] = records
    .map((rec): AqiSite | null => {
      const siteName = String(rec.sitename ?? "");
      if (!siteName) return null;
      const aqiValue = parseNum(rec.aqi);
      const { status, color } = getStatusAndColor(aqiValue);
      return {
        siteId: String(rec.siteid ?? ""),
        siteName,
        county: String(rec.county ?? ""),
        aqiValue,
        aqiStatus: String(rec.status ?? status),
        aqiColor: color,
        pm25: parseNum(rec["pm2.5"]),
        pm10: parseNum(rec.pm10),
        o3: parseNum(rec.o3),
        no2: parseNum(rec.no2),
        so2: parseNum(rec.so2),
        co: parseNum(rec.co),
        recordedAt: rec.publishtime ? String(rec.publishtime) : null,
      };
    })
    .filter((s): s is AqiSite => s !== null);

  cache = { sites, fetchedAt: Date.now() };
  return sites;
}

export async function GET(request: NextRequest) {
  const county = request.nextUrl.searchParams.get("county")?.trim();

  try {
    const all = await fetchAllSites();
    const stations = county ? all.filter((s) => s.county.includes(county)) : all;
    return NextResponse.json({ stations, updatedAt: cache?.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null });
  } catch (error) {
    console.error("GET /api/aqi failed:", error);
    return NextResponse.json({ error: "查詢 AQI 資料失敗" }, { status: 502 });
  }
}
