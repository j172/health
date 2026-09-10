#!/usr/bin/env node
/**
 * Ingests 61 Sheltered Workshops & Charity Products dataset (data/sheltered-workshops.json).
 * Performs fuzzy normalization matching against existing facilities, sets hasProducts = true,
 * records direct storeUrl and productNote, and elevates records to Tier-1 ranking.
 *
 * Usage:
 *   node scripts/ingest-sheltered-workshops.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { normalizeOrgName } from "../lib/server/npoOrganizations/npoUtils.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch {}
}

const DRY_RUN = process.argv.includes("--dry-run");
const DATA_FILE = path.resolve(__dirname, "../data/sheltered-workshops.json");

export function inferCityFromName(name) {
  const m = name.match(
    /(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/,
  );
  if (m) return m[1].replace("台", "臺");

  const shortMatch = name.match(/(花蓮|宜蘭|屏東|臺東|台東|澎湖|金門|連江|苗栗|彰化|南投|雲林)/);
  if (shortMatch) {
    const s = shortMatch[1].replace("台", "臺");
    return `${s}縣`;
  }

  const shortCity = name.match(/(台北|臺北|新北|基隆|桃園|新竹|台中|臺中|嘉義|台南|臺南|高雄)/);
  if (shortCity) {
    const sc = shortCity[1].replace("台", "臺");
    if (sc === "新北") return "新北市";
    return `${sc}市`;
  }

  return "全台灣";
}

async function main() {
  console.log(`[Sheltered Workshops] Starting ingestion. Dry run: ${DRY_RUN}`);

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const workshops = JSON.parse(raw);
  console.log(`[Sheltered Workshops] Loaded ${workshops.length} entries from ${DATA_FILE}`);

  let conn = null;
  if (!DRY_RUN) {
    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
    console.log("[Sheltered Workshops] Connected to MySQL database.");
  }

  let enrichedCount = 0;
  let insertedCount = 0;

  try {
    for (const item of workshops) {
      const normalized = normalizeOrgName(item.name);
      const city = inferCityFromName(item.name);

      if (DRY_RUN) {
        console.log(`[DRY-RUN] #${item.id} ${item.name} (${normalized}) -> ${item.storeUrl || "無網址"}`);
        continue;
      }

      // 1. Match against existing facilities
      let matchedId = null;
      let matchedExtra = {};

      const [rows] = await conn.query(
        "SELECT id, name, extra_json FROM facilities WHERE name LIKE ? LIMIT 5",
        [`%${normalized.slice(0, 5)}%`],
      );

      for (const row of rows) {
        const rowNorm = normalizeOrgName(row.name);
        if (rowNorm === normalized || rowNorm.includes(normalized) || normalized.includes(rowNorm)) {
          matchedId = row.id;
          try {
            matchedExtra = typeof row.extra_json === "string" ? JSON.parse(row.extra_json) : row.extra_json || {};
          } catch {}
          break;
        }
      }

      const extraJson = {
        ...matchedExtra,
        hasProducts: true,
        storeUrl: item.storeUrl || null,
        productNote: item.productNote,
        isShelteredWorkshop: true,
      };

      if (matchedId) {
        await conn.query(
          `UPDATE facilities SET
            service_item = COALESCE(service_item, ?),
            extra_json = ?,
            synced_at = NOW(),
            updated_at = NOW()
           WHERE id = ?`,
          [item.productNote, JSON.stringify(extraJson), matchedId],
        );
        enrichedCount++;
      } else {
        await conn.query(
          `INSERT INTO facilities (
            facility_type, source_key, source_id, name, address,
            service_item, data_org, extra_json, synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            "npo",
            "sheltered_workshop",
            String(item.id),
            item.name,
            city,
            item.productNote,
            "庇護工場公益禮盒名冊",
            JSON.stringify(extraJson),
          ],
        );
        insertedCount++;
      }
    }

    console.log(`[Sheltered Workshops] Finished! Enriched: ${enrichedCount}, Inserted: ${insertedCount}`);
  } catch (err) {
    console.error("[Sheltered Workshops] Error during ingestion:", err);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
