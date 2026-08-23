import { NextResponse } from "next/server";
import { fetchGovData } from "@/lib/server/http/govFetch";

export const dynamic = "force-dynamic";
export const revalidate = 1800; // 30 mins cache

export interface CDCTravelAlertItem {
  id: string;
  effective: string;
  alertTitle: string;
  severityLevel: string;
  levelCode: 1 | 2 | 3 | 0;
  disease: string;
  country: string;
  countryEn: string;
  instruction: string;
  web: string;
  lat: number | null;
  lng: number | null;
  iso: string;
}

export interface CDCEpidemicNewsItem {
  id: string;
  sent: string;
  effective: string;
  headline: string;
  description: string;
  disease: string;
  country: string;
  countryEn: string;
  web: string;
  lat: number | null;
  lng: number | null;
  iso: string;
}

function parseCsv(text: string): Record<string, string>[] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += char;
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];
  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

function extractCoordinates(circle: string): { lat: number | null; lng: number | null } {
  if (!circle) return { lat: null, lng: null };
  const parts = circle.split(",");
  if (parts.length !== 2) return { lat: null, lng: null };
  const lng = parseFloat(parts[0].trim());
  const lat = parseFloat(parts[1].trim());
  return {
    lat: isNaN(lat) ? null : lat,
    lng: isNaN(lng) ? null : lng,
  };
}

function parseSeverityLevelCode(levelStr: string): 1 | 2 | 3 | 0 {
  if (levelStr.includes("第三級") || levelStr.includes("警告") || levelStr.includes("Warning")) return 3;
  if (levelStr.includes("第二級") || levelStr.includes("警示") || levelStr.includes("Alert")) return 2;
  if (levelStr.includes("第一級") || levelStr.includes("注意") || levelStr.includes("Watch")) return 1;
  return 0;
}

import fs from "node:fs";
import path from "node:path";

let cachedCdcData: {
  timestamp: number;
  alerts: CDCTravelAlertItem[];
  news: CDCEpidemicNewsItem[];
} | null = null;
const CACHE_TTL_MS = 1800 * 1000; // 30 mins

function loadLocalBaselineCsv(filename: string): string {
  try {
    const filePath = path.join(process.cwd(), "data", filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    console.warn(`Failed to read local baseline ${filename}:`, err);
  }
  return "";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") || "").trim().toLowerCase();
    const levelFilter = searchParams.get("level");

    const now = Date.now();

    if (!cachedCdcData || now - cachedCdcData.timestamp > CACHE_TTL_MS) {
      let alertCsvText = "";
      let epidCsvText = "";

      // Try fetching live from CDC
      try {
        const [alertRes, epidRes] = await Promise.allSettled([
          fetchGovData("https://od.cdc.gov.tw/cdc/TCDCTravelAlert.csv"),
          fetchGovData("https://od.cdc.gov.tw/cdc/TCDCIntlEpidAll.csv"),
        ]);

        if (alertRes.status === "fulfilled" && alertRes.value.ok) {
          alertCsvText = await alertRes.value.text();
        }
        if (epidRes.status === "fulfilled" && epidRes.value.ok) {
          epidCsvText = await epidRes.value.text();
        }
      } catch (fetchErr) {
        console.warn("CDC live fetch failed, falling back:", fetchErr);
      }

      // Fallback to local baseline if remote fetch was empty
      if (!alertCsvText) {
        alertCsvText = loadLocalBaselineCsv("cdc-travel-alert.csv");
      }
      if (!epidCsvText) {
        epidCsvText = loadLocalBaselineCsv("cdc-intl-epid.csv");
      }

      let parsedAlerts: CDCTravelAlertItem[] = [];
      let parsedNews: CDCEpidemicNewsItem[] = [];

      if (alertCsvText) {
        const rows = parseCsv(alertCsvText);
        parsedAlerts = rows
          .filter((r) => r.areaDesc || r.alert_disease)
          .map((r, idx) => {
            const { lat, lng } = extractCoordinates(r.circle || "");
            const severityLevel = r.severity_level || "";
            return {
              id: `alert_${r.ISO3166 || ""}_${r.alert_disease || ""}_${idx}`,
              effective: r.effective || "",
              alertTitle: r.alert_title || "國際間旅遊疫情建議",
              severityLevel,
              levelCode: parseSeverityLevelCode(severityLevel),
              disease: r.alert_disease || "",
              country: r.areaDesc || "",
              countryEn: r.areaDesc_EN || "",
              instruction: r.instruction || "",
              web: r.web || "https://www.cdc.gov.tw",
              lat,
              lng,
              iso: r.ISO3166 || "",
            };
          });
      }

      if (epidCsvText) {
        const rows = parseCsv(epidCsvText);
        parsedNews = rows
          .filter((r) => r.headline || r.description)
          .map((r, idx) => {
            const { lat, lng } = extractCoordinates(r.circle || "");
            return {
              id: `epid_${r.ISO3166 || ""}_${idx}`,
              sent: r.sent || "",
              effective: r.effective || "",
              headline: r.headline || "",
              description: r.description || "",
              disease: r.alert_disease || "",
              country: r.areaDesc || "",
              countryEn: r.areaDesc_EN || "",
              web: r.web || "https://www.cdc.gov.tw",
              lat,
              lng,
              iso: r.ISO3166 || "",
            };
          });
      }

      if (parsedAlerts.length > 0 || parsedNews.length > 0) {
        cachedCdcData = {
          timestamp: now,
          alerts: parsedAlerts,
          news: parsedNews,
        };
      }
    }

    let alerts = cachedCdcData ? [...cachedCdcData.alerts] : [];
    let news = cachedCdcData ? [...cachedCdcData.news] : [];

    if (keyword) {
      alerts = alerts.filter(
        (a) =>
          a.country.toLowerCase().includes(keyword) ||
          a.countryEn.toLowerCase().includes(keyword) ||
          a.disease.toLowerCase().includes(keyword) ||
          a.instruction.toLowerCase().includes(keyword)
      );
      news = news.filter(
        (n) =>
          n.headline.toLowerCase().includes(keyword) ||
          n.description.toLowerCase().includes(keyword) ||
          n.country.toLowerCase().includes(keyword) ||
          n.disease.toLowerCase().includes(keyword)
      );
    }

    if (levelFilter) {
      const targetLevel = Number(levelFilter);
      if (!isNaN(targetLevel) && targetLevel > 0) {
        alerts = alerts.filter((a) => a.levelCode === targetLevel);
      }
    }

    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      alertsCount: alerts.length,
      newsCount: news.length,
      alerts,
      news,
    });
  } catch (error: any) {
    console.error("CDC Travel alerts API error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Failed to fetch CDC travel alerts" },
      { status: 500 }
    );
  }
}
