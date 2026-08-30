import fs from "node:fs";
import path from "node:path";
import { fetchGovData } from "@/lib/server/http/govFetch";
import { withConnection, utcNowSql } from "@/lib/server/db/mysql";

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
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip carriage return
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
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

function parseCoordinates(
  circle: string,
  defaultOrder: "lng_lat" | "lat_lng" = "lng_lat"
): { lat: number | null; lng: number | null } {
  if (!circle) return { lat: null, lng: null };
  const parts = circle.split(",");
  if (parts.length !== 2) return { lat: null, lng: null };
  const num1 = parseFloat(parts[0].trim());
  const num2 = parseFloat(parts[1].trim());
  if (isNaN(num1) || isNaN(num2)) return { lat: null, lng: null };

  // If one of the numbers is clearly outside [-90, 90], it MUST be longitude.
  if (Math.abs(num1) > 90 && Math.abs(num2) <= 90) {
    return { lng: num1, lat: num2 };
  }
  if (Math.abs(num2) > 90 && Math.abs(num1) <= 90) {
    return { lat: num1, lng: num2 };
  }

  // If both are within [-90, 90], use default order for the dataset
  if (defaultOrder === "lng_lat") {
    return { lng: num1, lat: num2 };
  } else {
    return { lat: num1, lng: num2 };
  }
}

function parseSeverityLevelCode(levelStr: string): 1 | 2 | 3 | 0 {
  if (levelStr.includes("第三級") || levelStr.includes("警告") || levelStr.includes("Warning")) return 3;
  if (levelStr.includes("第二級") || levelStr.includes("警示") || levelStr.includes("Alert")) return 2;
  if (levelStr.includes("第一級") || levelStr.includes("注意") || levelStr.includes("Watch")) return 1;
  return 0;
}

function parseSqlDateTime(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function readLocalCsvFallback(filename: string): string {
  const candidatePaths = [
    path.join(process.cwd(), "data", filename),
    path.join(process.cwd(), "public", "data", filename),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        if (content.trim().length > 0) {
          return content;
        }
      } catch (err) {
        console.warn(`[CDC Ingest] Failed to read fallback file ${p}:`, err);
      }
    }
  }
  return "";
}

export async function runCdcAlertsSync(payload?: {
  travelAlertCsv?: string;
  intlEpidCsv?: string;
}): Promise<{
  travelAlerts: number;
  epidemicNews: number;
}> {
  let travelAlertCsv = payload?.travelAlertCsv || "";
  if (!travelAlertCsv) {
    try {
      const res = await fetchGovData(TRAVEL_ALERT_CSV_URL);
      if (res.ok) {
        travelAlertCsv = await res.text();
      }
    } catch (err) {
      console.warn("[CDC Ingest] Remote travel alert fetch failed, checking local baseline CSV:", err);
    }
  }
  if (!travelAlertCsv) {
    travelAlertCsv = readLocalCsvFallback("cdc-travel-alert.csv");
  }

  let intlEpidCsv = payload?.intlEpidCsv || "";
  if (!intlEpidCsv) {
    try {
      const res = await fetchGovData(INTL_EPID_CSV_URL);
      if (res.ok) {
        intlEpidCsv = await res.text();
      }
    } catch (err) {
      console.warn("[CDC Ingest] Remote epidemic news fetch failed, checking local baseline CSV:", err);
    }
  }
  if (!intlEpidCsv) {
    intlEpidCsv = readLocalCsvFallback("cdc-intl-epid.csv");
  }

  const alertRecords = travelAlertCsv ? parseCsv(travelAlertCsv) : [];
  const epidRecords = intlEpidCsv ? parseCsv(intlEpidCsv) : [];

  const now = utcNowSql();
  let alertCount = 0;
  let newsCount = 0;

  await withConnection(async (conn) => {
    // 1. Ingest Travel Alerts
    if (alertRecords.length > 0) {
      const alertMap = new Map<string, any[]>();

      for (let idx = 0; idx < alertRecords.length; idx++) {
        const r = alertRecords[idx];
        const disease = r["alert_disease"] || r["disease"] || r["疾病名稱"] || r["疾病"] || "";
        const country = r["areaDesc"] || r["country"] || r["國家/地區"] || r["國家"] || "";
        const countryEn = r["areaDesc_EN"] || r["country_en"] || r["英文國家/地區名稱"] || r["英文國家"] || null;
        const areaDetail = r["areaDetail"] || r["區域"] || r["地區"] || "";
        const severityLevel = r["severity_level"] || r["alert_level"] || r["警示等級"] || r["等級"] || "未分類";
        const levelCode = parseSeverityLevelCode(severityLevel);
        const instruction = r["instruction"] || r["說明"] || r["建議"] || null;
        const web = r["web"] || r["詳情連結"] || r["連結"] || r["網址"] || null;
        const coords = parseCoordinates(r["circle"] || r["經緯度"] || r["座標"] || "", "lng_lat");
        const iso = r["ISO3166"] || r["ISO"] || r["iso"] || r["ISO3166_2"] || "";
        const effectiveAt = parseSqlDateTime(r["effective"] || r["有效日期"] || r["發布日期"] || r["sent"]);

        const alertTitle =
          r["alert_title"] ||
          r["headline"] ||
          r["title"] ||
          r["標題"] ||
          (disease && country ? `${country} - ${disease}` : disease || country || "國際旅遊疫情建議");

        if (!country && !disease && !alertTitle) continue;

        let id = r["id"];
        if (!id) {
          const keyPart = [iso || country, disease, areaDetail].filter(Boolean).join("_");
          id = `alert_${keyPart || idx}`.replace(/[\s\/\\]+/g, "_").slice(0, 100);
        }

        // Deduplicate in batch: keep first (newest in chronological feed)
        if (!alertMap.has(id)) {
          alertMap.set(id, [
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
          ]);
        }
      }

      const alertValues = Array.from(alertMap.values());
      const BATCH_SIZE = 500;
      for (let i = 0; i < alertValues.length; i += BATCH_SIZE) {
        const chunk = alertValues.slice(i, i + BATCH_SIZE);
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
          [chunk]
        );
      }
      alertCount = alertValues.length;
    }

    // 2. Ingest Epidemic News
    if (epidRecords.length > 0) {
      const newsMap = new Map<string, any[]>();

      for (let idx = 0; idx < epidRecords.length; idx++) {
        const r = epidRecords[idx];
        const headline = r["headline"] || r["title"] || r["標題"] || r["alert_title"] || "";
        if (!headline) continue;

        const description = r["description"] || r["內容"] || r["說明"] || null;
        const disease = r["alert_disease"] || r["disease"] || r["疾病名稱"] || r["疾病"] || "";
        const country = r["areaDesc"] || r["country"] || r["國家/地區"] || r["國家"] || "";
        const countryEn = r["areaDesc_EN"] || r["country_en"] || r["英文國家/地區名稱"] || null;
        const web = r["web"] || r["詳情連結"] || r["連結"] || r["網址"] || null;
        const coords = parseCoordinates(r["circle"] || r["經緯度"] || r["座標"] || "", "lat_lng");
        const iso = r["ISO3166"] || r["ISO"] || r["iso"] || r["ISO3166_2"] || "";
        const sentAt = parseSqlDateTime(r["sent"] || r["發布日期"] || r["effective"]);
        const effectiveAt = parseSqlDateTime(r["effective"] || r["有效日期"] || r["sent"]);

        let id = r["id"];
        if (!id && web) {
          const match = web.match(/epidemicId=([a-zA-Z0-9_-]+)/);
          if (match) id = `news_${match[1]}`;
        }
        if (!id) {
          const datePart = sentAt ? sentAt.slice(0, 10) : `idx${idx}`;
          id = `news_${datePart}_${headline.slice(0, 30)}`.replace(/[\s\/\\]+/g, "_").slice(0, 100);
        }

        if (!newsMap.has(id)) {
          newsMap.set(id, [
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
          ]);
        }
      }

      const newsValues = Array.from(newsMap.values());
      const BATCH_SIZE = 500;
      for (let i = 0; i < newsValues.length; i += BATCH_SIZE) {
        const chunk = newsValues.slice(i, i + BATCH_SIZE);
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
          [chunk]
        );
      }
      newsCount = newsValues.length;
    }
  });

  return { travelAlerts: alertCount, epidemicNews: newsCount };
}


