import { withConnection } from "@/lib/server/db/mysql";
import type { RowDataPacket } from "mysql2/promise";
import { runCdcAlertsSync } from "./ingestCdcAlerts";

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

let isSeeding = false;

async function checkAndAutoSeedCdc(): Promise<void> {
  if (isSeeding) return;
  try {
    const rows = await withConnection(async (conn) => {
      const [r] = await conn.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS cnt FROM cdc_travel_alerts"
      );
      return r;
    });
    if ((rows[0]?.cnt ?? 0) === 0) {
      isSeeding = true;
      runCdcAlertsSync()
        .then((res) => console.log("[CDC Queries] Auto-seed complete:", res))
        .catch((err) => console.error("[CDC Queries] Auto-seed error:", err))
        .finally(() => {
          isSeeding = false;
        });
    }
  } catch (err) {
    console.warn("[CDC Queries] Auto-seed check error:", err);
  }
}

export async function getCdcTravelAlerts(params: {
  country?: string;
  disease?: string;
  level?: string;
  keyword?: string;
}): Promise<{
  alerts: CDCTravelAlertItem[];
  epidemicNews: CDCEpidemicNewsItem[];
  stats: {
    level3Count: number;
    level2Count: number;
    level1Count: number;
    totalCountries: number;
  };
  updatedAt: string;
}> {
  checkAndAutoSeedCdc();

  return await withConnection(async (conn) => {
    const [alertRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, alert_title, severity_level, level_code, disease, country,
              country_en, instruction, web, lat, lng, iso, effective_at
       FROM cdc_travel_alerts
       ORDER BY level_code DESC, country ASC`
    );

    const [newsRows] = await conn.query<RowDataPacket[]>(
      `SELECT id, sent_at, effective_at, headline, description, disease,
              country, country_en, web, lat, lng, iso
       FROM cdc_epidemic_news
       ORDER BY COALESCE(sent_at, effective_at, created_at) DESC
       LIMIT 50`
    );

    let alerts: CDCTravelAlertItem[] = alertRows.map((r) => ({
      id: r.id,
      effective: r.effective_at ? new Date(r.effective_at).toISOString().slice(0, 10) : "",
      alertTitle: r.alert_title,
      severityLevel: r.severity_level,
      levelCode: r.level_code as 1 | 2 | 3 | 0,
      disease: r.disease,
      country: r.country,
      countryEn: r.country_en || "",
      instruction: r.instruction || "",
      web: r.web || "",
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
      iso: r.iso || "",
    }));

    let epidemicNews: CDCEpidemicNewsItem[] = newsRows.map((r) => ({
      id: r.id,
      sent: r.sent_at ? new Date(r.sent_at).toISOString().slice(0, 10) : "",
      effective: r.effective_at ? new Date(r.effective_at).toISOString().slice(0, 10) : "",
      headline: r.headline,
      description: r.description || "",
      disease: r.disease,
      country: r.country,
      countryEn: r.country_en || "",
      web: r.web || "",
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
      iso: r.iso || "",
    }));

    const { country, disease, level, keyword } = params;

    if (country) {
      alerts = alerts.filter(
        (a) =>
          a.country.toLowerCase().includes(country.toLowerCase()) ||
          a.countryEn.toLowerCase().includes(country.toLowerCase())
      );
      epidemicNews = epidemicNews.filter(
        (n) =>
          n.country.toLowerCase().includes(country.toLowerCase()) ||
          n.countryEn.toLowerCase().includes(country.toLowerCase())
      );
    }

    if (disease) {
      alerts = alerts.filter((a) =>
        a.disease.toLowerCase().includes(disease.toLowerCase())
      );
      epidemicNews = epidemicNews.filter((n) =>
        n.disease.toLowerCase().includes(disease.toLowerCase())
      );
    }

    if (level) {
      const lvlNum = parseInt(level, 10);
      if (!isNaN(lvlNum)) {
        alerts = alerts.filter((a) => a.levelCode === lvlNum);
      }
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      alerts = alerts.filter(
        (a) =>
          a.alertTitle.toLowerCase().includes(kw) ||
          a.country.toLowerCase().includes(kw) ||
          a.countryEn.toLowerCase().includes(kw) ||
          a.disease.toLowerCase().includes(kw) ||
          a.instruction.toLowerCase().includes(kw)
      );
      epidemicNews = epidemicNews.filter(
        (n) =>
          n.headline.toLowerCase().includes(kw) ||
          n.country.toLowerCase().includes(kw) ||
          n.countryEn.toLowerCase().includes(kw) ||
          n.disease.toLowerCase().includes(kw) ||
          n.description.toLowerCase().includes(kw)
      );
    }

    const level3Count = alertRows.filter((a) => a.level_code === 3).length;
    const level2Count = alertRows.filter((a) => a.level_code === 2).length;
    const level1Count = alertRows.filter((a) => a.level_code === 1).length;
    const totalCountries = new Set(alertRows.map((a) => a.country)).size;

    return {
      alerts,
      epidemicNews,
      stats: {
        level3Count,
        level2Count,
        level1Count,
        totalCountries,
      },
      updatedAt: new Date().toISOString(),
    };
  });
}
