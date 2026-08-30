#!/usr/bin/env node
/**
 * Standalone CLI script to seed / import MOC Public Art dataset directly into MySQL.
 *
 * Can be run manually or via scheduled cron to sync all 6,350+ public art installations
 * across Taiwan into the `public_arts` database table.
 *
 * Usage:
 *   node scripts/import-moc-public-art.mjs
 */

import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DB_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const DB_PORT = Number(process.env.MYSQL_PORT || "3306");
const DB_USER = process.env.MYSQL_USER || "root";
const DB_PASSWORD = process.env.MYSQL_PASSWORD || "";
const DB_NAME = process.env.MYSQL_DATABASE || "health_db";

function toSqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  console.log("=== MOC Public Art Direct MySQL Importer ===");
  const jsonPath = path.join(process.cwd(), "data", "public-art.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Missing data/public-art.json file.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Loaded ${raw.length} items from data/public-art.json`);

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 4,
    charset: "utf8mb4",
    timezone: "Z",
  });

  const now = toSqlDateTime(new Date());
  const BATCH_SIZE = 250;
  let totalProcessed = 0;

  console.log("Inserting rows into public_arts table in MySQL...");

  for (let i = 0; i < raw.length; i += BATCH_SIZE) {
    const chunk = raw.slice(i, i + BATCH_SIZE);
    const values = chunk.map((a) => [
      a.artNo || a.id,
      a.title,
      a.artist || null,
      a.dimensions || null,
      a.material || null,
      a.city || null,
      a.location || null,
      a.lat ?? null,
      a.lng ?? null,
      a.fieldType || null,
      a.description || null,
      a.imageUrl || null,
      a.year || null,
      a.sourceUrl || null,
      a.agency || null,
      now,
      now,
    ]);

    await pool.query(
      `INSERT INTO public_arts (
         art_no, title, artist, dimensions, material, city, location,
         lat, lng, field_type, description, image_url, year, source_url,
         agency, created_at, updated_at
       ) VALUES ?
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         artist = VALUES(artist),
         dimensions = VALUES(dimensions),
         material = VALUES(material),
         city = VALUES(city),
         location = VALUES(location),
         lat = VALUES(lat),
         lng = VALUES(lng),
         field_type = VALUES(field_type),
         description = VALUES(description),
         image_url = VALUES(image_url),
         year = VALUES(year),
         source_url = VALUES(source_url),
         agency = VALUES(agency),
         updated_at = VALUES(updated_at)`,
      [values]
    );
    totalProcessed += chunk.length;
    process.stdout.write(`\r  Progress: ${totalProcessed} / ${raw.length} records processed`);
  }

  console.log("\n✅ Successfully imported all public art records into MySQL!");
  await pool.end();
}

main().catch((err) => {
  console.error("\n❌ Import failed:", err);
  process.exit(1);
});

