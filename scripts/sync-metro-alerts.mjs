#!/usr/bin/env node
/**
 * Syncs Taipei Metro announcements (Elevator maintenance & operational alerts)
 * Source: Taipei City Open Data (rid=649c44eb-60b5-4746-a353-cbdc6651fc09)
 * Format: Big5 CSV
 *
 * Saves to data/metro-alerts-seed.json and upserts into MySQL metro_alerts table if available.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const SOURCE_URL =
  "https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=649c44eb-60b5-4746-a353-cbdc6651fc09";

const SEED_FILE = path.join(process.cwd(), "data", "metro-alerts-seed.json");

function parseDate(rawStr) {
  // Format: 20260911T202100 -> 2026-09-11 20:21:00
  if (!rawStr) return new Date().toISOString().slice(0, 19).replace("T", " ");
  const clean = rawStr.trim().replace("T", "");
  if (clean.length >= 14) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    const h = clean.slice(8, 10);
    const min = clean.slice(10, 12);
    const s = clean.slice(12, 14);
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export async function syncMetroAlerts() {
  console.log("=== Syncing Taipei Metro Alerts ===");
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Metro CSV: ${res.status} ${res.statusText}`);
  }

  const buf = await res.arrayBuffer();
  const text = new TextDecoder("big5").decode(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length <= 1) {
    console.log("No alert records found in Metro CSV.");
    return [];
  }

  // Header: 項次,日期時間,路線,車站,說明
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Simple CSV parser handling quotes
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        parts.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    parts.push(current.trim());

    if (parts.length >= 5) {
      const [seq, dt, lineName, stationName, desc] = parts;
      const formattedTime = parseDate(dt);
      const extId = crypto
        .createHash("md5")
        .update(`${dt}_${lineName}_${stationName}_${desc}`)
        .digest("hex")
        .slice(0, 32);

      const alertType = desc.includes("電梯") ? "elevator" : "operational";
      const title = desc.includes("電梯")
        ? `${stationName} 電梯檢修暫停使用公告`
        : `${lineName} ${stationName} 營運資訊公告`;

      records.push({
        externalId: extId,
        lineName: lineName.replace(/捷運/g, "").trim(),
        stationName: stationName.trim(),
        alertTitle: title,
        alertContent: desc.trim(),
        alertType,
        alertTime: formattedTime,
        status: "active",
      });
    }
  }

  console.log(`Parsed ${records.length} Metro alerts.`);

  // Write to seed file
  fs.writeFileSync(SEED_FILE, JSON.stringify(records, null, 2), "utf-8");
  console.log(`Saved seed to ${SEED_FILE}`);

  // DB upsert if available
  if (process.env.MYSQL_DATABASE) {
    try {
      const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST || "127.0.0.1",
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      console.log("Connected to MySQL for Metro alerts sync.");
      for (const r of records) {
        await conn.query(
          `INSERT INTO metro_alerts (
            external_id, line_name, station_name, alert_title, alert_content,
            alert_type, alert_time, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            alert_title = VALUES(alert_title),
            alert_content = VALUES(alert_content),
            alert_type = VALUES(alert_type),
            alert_time = VALUES(alert_time),
            status = VALUES(status),
            updated_at = NOW()`,
          [
            r.externalId,
            r.lineName,
            r.stationName,
            r.alertTitle,
            r.alertContent,
            r.alertType,
            r.alertTime,
            r.status,
          ]
        );
      }
      await conn.end();
      console.log("Upserted Metro alerts into MySQL successfully.");
    } catch (dbErr) {
      console.warn("MySQL sync skipped or unavailable:", dbErr.message);
    }
  }

  return records;
}

if (process.argv[1] && process.argv[1].endsWith("sync-metro-alerts.mjs")) {
  syncMetroAlerts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Metro alert sync error:", err);
      process.exit(1);
    });
}
