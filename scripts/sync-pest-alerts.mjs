#!/usr/bin/env node
/**
 * Syncs MOA Crop Pest Alerts (動植物防疫檢疫署 - 作物病蟲害即時預警)
 * Source: https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=4KDR5HtfkTBp
 *
 * Saves to data/pest-alerts-seed.json and upserts into MySQL pest_alerts table if available.
 */

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const SOURCE_URL =
  "https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=4KDR5HtfkTBp";

const SEED_FILE = path.join(process.cwd(), "data", "pest-alerts-seed.json");

function parseDate(rawStr) {
  if (!rawStr) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = rawStr.replace(/[- :T]/g, "");
  if (clean.length >= 14) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)} ${clean.slice(8, 10)}:${clean.slice(10, 12)}:${clean.slice(12, 14)}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export async function syncPestAlerts() {
  console.log("=== Syncing MOA Crop Pest Alerts ===");
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pest alerts: ${res.status} ${res.statusText}`);
  }

  const rawList = await res.json();
  if (!Array.isArray(rawList)) {
    console.warn("Unexpected pest alert response structure.");
    return [];
  }

  console.log(`Received ${rawList.length} raw pest alert items.`);
  const records = [];

  for (const item of rawList) {
    let parsedData = [];
    let crops = new Set();
    let highestLevel = "綠燈";

    try {
      if (typeof item.AlertData === "string") {
        parsedData = JSON.parse(item.AlertData);
      } else if (Array.isArray(item.AlertData)) {
        parsedData = item.AlertData;
      }
    } catch {
      parsedData = [];
    }

    if (Array.isArray(parsedData)) {
      for (const p of parsedData) {
        if (p.WarningLevel) {
          if (p.WarningLevel.includes("紅")) highestLevel = "紅燈";
          else if (p.WarningLevel.includes("黃") && highestLevel !== "紅燈") highestLevel = "黃燈";
        }
        if (Array.isArray(p.SurveyRecord)) {
          for (const s of p.SurveyRecord) {
            if (s.CropName) crops.add(s.CropName);
          }
        }
      }
    }

    records.push({
      subjectName: item.SubjectName || "農作物病蟲害",
      monitorType: item.MonitorType || "即時示警",
      alertTime: parseDate(item.AlertTime),
      targetCrops: [...crops].join("、") || "一般農作物",
      warningLevel: highestLevel,
      alertDataJson: JSON.stringify(parsedData),
      status: "active",
    });
  }

  console.log(`Parsed ${records.length} pest alerts.`);

  // Write seed file
  fs.writeFileSync(SEED_FILE, JSON.stringify(records, null, 2), "utf-8");
  console.log(`Saved seed to ${SEED_FILE}`);

  // Upsert into MySQL if available
  if (process.env.MYSQL_DATABASE && records.length > 0) {
    try {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      console.log("Connected to MySQL for pest alerts sync.");
      for (const r of records) {
        await conn.query(
          `INSERT INTO pest_alerts (
            subject_name, monitor_type, alert_time, target_crops,
            alert_data_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            r.subjectName,
            r.monitorType,
            r.alertTime,
            r.targetCrops,
            r.alertDataJson,
            r.status,
          ]
        );
      }
      await conn.end();
      console.log("Upserted pest alerts into MySQL successfully.");
    } catch (dbErr) {
      console.warn("MySQL sync skipped or unavailable:", dbErr.message);
    }
  }

  return records;
}

if (process.argv[1] && process.argv[1].endsWith("sync-pest-alerts.mjs")) {
  syncPestAlerts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Pest alerts sync error:", err);
      process.exit(1);
    });
}
