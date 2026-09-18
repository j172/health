#!/usr/bin/env node
/**
 * scripts/repair-shih-hsin-dates.mjs
 *
 * Standalone repair script to calibrate published_at_utc and payload_hash for all
 * existing Shih Hsin University (shih_hsin) news items in MySQL.
 *
 * Background:
 * Prior to fixing `parseTaipeiDateToUtc`, Shih Hsin articles were assigned `nowUtc`
 * during every ingestion run because YYYY-MM-DD strings failed the strict regex.
 * This script recalibrates each article's `published_at_utc` to its actual historical
 * publication date (derived from the spotlight image filename date code).
 *
 * Usage:
 *   node scripts/repair-shih-hsin-dates.mjs [--dry-run]
 */

import crypto from "node:crypto";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const isDryRun = process.argv.includes("--dry-run");

const KNOWN_SID_DATES = {
  "32797": "2026-09-18",
  "32793": "2026-09-15",
  "32786": "2026-09-11",
  "32783": "2026-09-10",
  "32782": "2026-09-09",
  "32781": "2026-09-01",
  "32774": "2026-08-28",
  "32770": "2026-08-26",
  "32769": "2026-08-21",
  "32768": "2026-08-19",
};

const sha256 = (str) => crypto.createHash("sha256").update(str).digest("hex");

function parseTaipeiDateToUtc(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] !== undefined ? Number(m[4]) : 0;
  const minute = m[5] !== undefined ? Number(m[5]) : 0;
  const second = m[6] !== undefined ? Number(m[6]) : 0;
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  const DB_HOST = process.env.MYSQL_HOST || "127.0.0.1";
  const DB_PORT = Number(process.env.MYSQL_PORT || "3306");
  const DB_USER = process.env.MYSQL_USER || "root";
  const DB_PASSWORD = process.env.MYSQL_PASSWORD || "";
  const DB_NAME = process.env.MYSQL_DATABASE || "health_db";

  console.log(`[repair-shih-hsin-dates] Connecting to MySQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}...`);
  if (isDryRun) {
    console.log("[repair-shih-hsin-dates] Running in DRY RUN mode. No changes will be written.");
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    const [rows] = await conn.query(
      `SELECT n.id, n.external_id, n.canonical_url, n.title, n.published_at_utc, n.payload_hash,
              (SELECT a.url FROM news_assets a WHERE a.news_item_id = n.id AND a.asset_type = 'image' LIMIT 1) AS asset_url
       FROM news_items n
       WHERE n.source_name = 'shih_hsin'
       ORDER BY n.id ASC`,
    );

    console.log(`[repair-shih-hsin-dates] Found ${rows.length} Shih Hsin news items in database.`);

    let updatedCount = 0;

    for (const row of rows) {
      // Extract sID from external_id or canonical_url
      const sIdMatch = (row.external_id || "").match(/shih_hsin_(\d+)/) ||
                       (row.canonical_url || "").match(/sID=(\d+)/i);
      const sId = sIdMatch ? sIdMatch[1] : null;

      let dateStr = sId ? KNOWN_SID_DATES[sId] : null;

      // Fallback: extract from asset_url if available
      if (!dateStr && row.asset_url) {
        const dateMatch = row.asset_url.match(/(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
        if (dateMatch) {
          dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
      }

      if (!dateStr) {
        console.warn(`[repair-shih-hsin-dates] Could not determine historical date for row ${row.id} (${row.title}), skipping.`);
        continue;
      }

      const newPublishedAtUtc = parseTaipeiDateToUtc(dateStr);
      if (!newPublishedAtUtc) {
        console.warn(`[repair-shih-hsin-dates] Failed to parse date "${dateStr}" for row ${row.id}, skipping.`);
        continue;
      }

      const newPublishedSql = toSqlDateTime(newPublishedAtUtc);
      const newPayloadHash = sha256(
        JSON.stringify({
          title: row.title,
          canonicalUrl: row.canonical_url,
          publishedAtUtc: newPublishedAtUtc.toISOString(),
          imageUrl: row.asset_url || null,
        }),
      );

      console.log(
        `[Row ${row.id}] sID: ${sId} | Target Date: ${dateStr} (UTC: ${newPublishedSql}) | Title: ${row.title.slice(0, 30)}...`,
      );

      if (!isDryRun) {
        await conn.execute(
          `UPDATE news_items
           SET published_at_utc = ?, payload_hash = ?, updated_at = NOW()
           WHERE id = ?`,
          [newPublishedSql, newPayloadHash, row.id],
        );
      }
      updatedCount++;
    }

    console.log(
      `[repair-shih-hsin-dates] Complete. ${updatedCount}/${rows.length} rows ${isDryRun ? "evaluated (dry-run)" : "successfully updated"}.`,
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[repair-shih-hsin-dates] Error:", err.message);
  process.exit(1);
});
