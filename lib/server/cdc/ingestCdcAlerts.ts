import fs from "node:fs";
import path from "node:path";
import { fetchGovData } from "@/lib/server/http/govFetch";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";
import type { ResultSetHeader } from "mysql2/promise";

const TRAVEL_ALERT_CSV_URL =
  "https://data.cdc.gov.tw/download?treeid=d49f7011afb78338&tableid=d824d55b0a37397e&format=csv";
const INTL_EPID_CSV_URL =
  "https://data.cdc.gov.tw/download?treeid=d49f7011afb78338&tableid=1a28a306dfda3c61&format=csv";

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

export async function runCdcAlertsSync(): Promise<{
  travelAlerts: number;
  epidemicNews: number;
}> {
  let travelAlertCsv = "";
  try {
    const res = await fetchGovData(TRAVEL_ALERT_CSV_URL);
    if (res.ok) travelAlertCsv = await res.text();
  } catch (err) {
    console.warn("[CDC Ingest] Remote travel alert fetch failed, checking local data/cdc-travel-alert.csv:", err);
  }
  if (!travelAlertCsv) {
    const localFile = path.join(process.cwd(), "data", "cdc-travel-alert.csv");
    if (fs.existsSync(localFile)) {
      travelAlertCsv = fs.readFileSync(localFile, "utf-8");
    }
  }

  let intlEpidCsv = "";
  try {
    const res = await fetchGovData(INTL_EPID_CSV_URL);
    if (res.ok) intlEpidCsv = await res.text();
  } catch (err) {
    console.warn("[CDC Ingest] Remote epidemic news fetch failed, checking local data/cdc-intl-epid.csv:", err);
  }
  if (!intlEpidCsv) {
    const localFile = path.join(process.cwd(), "data", "cdc-intl-epid.csv");
    if (fs.existsSync(localFile)) {
      intlEpidCsv = fs.readFileSync(localFile, "utf-8");
    }
  }

  const alertRecords = travelAlertCsv ? parseCsv(travelAlertCsv) : [];
  const epidRecords = intlEpidCsv ? parseCsv(intlEpidCsv) : [];

  const now = utcNowSql();
  let alertCount = 0;
  let newsCount = 0;

  await withConnection(async (conn) => {
    // 1. Ingest Travel Alerts
    if (alertRecords.length > 0) {
      const values = alertRecords
        .map((r, idx) => {
          const id = r["id"] || `alert_${r["iso"] || r["areaDesc"] || idx}`;
          const alertTitle = r["headline"] || r["alert_disease"] || r["description"] || "";
          if (!alertTitle) return null;
          const severityLevel = r["severity_level"] || r["alert_level"] || "未分類";
          const levelCode = parseSeverityLevelCode(severityLevel);
          const disease = r["alert_disease"] || r["disease"] || "";
          const country = r["areaDesc"] || r["country"] || "";
          const countryEn = r["areaDesc_EN"] || r["country_en"] || null;
          const instruction = r["instruction"] || null;
          const web = r["web"] || null;
          const coords = extractCoordinates(r["circle"] || "");
          const iso = r["iso"] || "";
          const effectiveAt = r["effective"] ? new Date(r["effective"]).toISOString().slice(0, 19).replace("T", " ") : null;

          return [
            id,
            alertTitle,
            severityLevel,
            levelCode,
            disease,
            country,
            countryEn,
            instruction,
            web,
            coords.lat,
            coords.lng,
            iso,
            effectiveAt,
            now,
            now,
          ];
        })
        .filter(Boolean);

      if (values.length > 0) {
        await conn.query(
          `INSERT INTO cdc_travel_alerts (
             id, alert_title, severity_level, level_code, disease, country,
             country_en, instruction, web, lat, lng, iso, effective_at,
             created_at, updated_at
           ) VALUES ?
           ON DUPLICATE KEY UPDATE
             alert_title = VALUES(alert_title),
             severity_level = VALUES(severity_level),
             level_code = VALUES(level_code),
             disease = VALUES(disease),
             country = VALUES(country),
             country_en = VALUES(country_en),
             instruction = VALUES(instruction),
             web = VALUES(web),
             lat = VALUES(lat),
             lng = VALUES(lng),
             iso = VALUES(iso),
             effective_at = VALUES(effective_at),
             updated_at = VALUES(updated_at)`,
          [values]
        );
        alertCount = values.length;
      }
    }

    // 2. Ingest Epidemic News
    if (epidRecords.length > 0) {
      const values = epidRecords
        .map((r, idx) => {
          const id = r["id"] || `news_${idx}`;
          const headline = r["headline"] || "";
          if (!headline) return null;
          const description = r["description"] || null;
          const disease = r["disease"] || "";
          const country = r["areaDesc"] || r["country"] || "";
          const countryEn = r["areaDesc_EN"] || r["country_en"] || null;
          const web = r["web"] || null;
          const coords = extractCoordinates(r["circle"] || "");
          const iso = r["iso"] || "";
          const sentAt = r["sent"] ? new Date(r["sent"]).toISOString().slice(0, 19).replace("T", " ") : null;
          const effectiveAt = r["effective"] ? new Date(r["effective"]).toISOString().slice(0, 19).replace("T", " ") : null;

          return [
            id,
            sentAt,
            effectiveAt,
            headline,
            description,
            disease,
            country,
            countryEn,
            web,
            coords.lat,
            coords.lng,
            iso,
            now,
            now,
          ];
        })
        .filter(Boolean);

      if (values.length > 0) {
        await conn.query(
          `INSERT INTO cdc_epidemic_news (
             id, sent_at, effective_at, headline, description, disease,
             country, country_en, web, lat, lng, iso, created_at, updated_at
           ) VALUES ?
           ON DUPLICATE KEY UPDATE
             sent_at = VALUES(sent_at),
             effective_at = VALUES(effective_at),
             headline = VALUES(headline),
             description = VALUES(description),
             disease = VALUES(disease),
             country = VALUES(country),
             country_en = VALUES(country_en),
             web = VALUES(web),
             lat = VALUES(lat),
             lng = VALUES(lng),
             iso = VALUES(iso),
             updated_at = VALUES(updated_at)`,
          [values]
        );
        newsCount = values.length;
      }
    }
  });

  return { travelAlerts: alertCount, epidemicNews: newsCount };
}

