#!/usr/bin/env node
/**
 * Ingests 61 Sheltered Workshops & Charity Products dataset (data/sheltered-workshops.json).
 * Performs fuzzy normalization matching against existing facilities, sets hasProducts = true,
 * records direct storeUrl, productNote, full physical street address, phone, and WGS84 coordinates.
 *
 * Usage:
 *   node scripts/ingest-sheltered-workshops.mjs [--dry-run] [--remote]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
const FORCE_REMOTE = process.argv.includes("--remote");
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

export function runRemoteNode(scriptCode) {
  const sshUser = process.env.SSH_USER || "tw123457";
  const sshHost = process.env.SSH_HOST || "103.21.221.12";
  const sshKey = path.resolve(process.cwd(), ".ssh/health_host_id_rsa");
  if (!fs.existsSync(sshKey)) {
    throw new Error(`SSH Key not found at ${sshKey}`);
  }
  const cmd = `ssh -i "${sshKey}" -p 22 -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${sshUser}@${sshHost} "cd /home/tw123457/health_app && node --env-file=.env"`;
  return execSync(cmd, { input: scriptCode, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
}

async function runLocalIngestion(workshops) {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 5000,
  });

  let enrichedCount = 0;
  let insertedCount = 0;

  try {
    for (const item of workshops) {
      const normalized = normalizeOrgName(item.name);
      const city = item.address ? inferCityFromName(item.address) : inferCityFromName(item.name);

      // Match against existing facilities
      let matchedId = null;
      let matchedExtra = {};

      const [rows] = await conn.query(
        "SELECT id, name, extra_json FROM facilities WHERE (source_key = 'sheltered_workshop' AND source_id = ?) OR name = ? OR name LIKE ? LIMIT 10",
        [String(item.id), item.name, `%${normalized.slice(0, 5)}%`],
      );

      for (const row of rows) {
        if (row.name === item.name) {
          matchedId = row.id;
          try {
            matchedExtra = typeof row.extra_json === "string" ? JSON.parse(row.extra_json) : row.extra_json || {};
          } catch {}
          break;
        }
      }

      if (!matchedId) {
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
            address = COALESCE(?, address),
            phone = COALESCE(?, phone),
            lat = COALESCE(?, lat),
            lng = COALESCE(?, lng),
            service_item = COALESCE(service_item, ?),
            extra_json = ?,
            synced_at = NOW(),
            updated_at = NOW()
           WHERE id = ?`,
          [
            item.address || city,
            item.phone || null,
            item.lat || null,
            item.lng || null,
            item.productNote,
            JSON.stringify(extraJson),
            matchedId,
          ],
        );
        enrichedCount++;
      } else {
        await conn.query(
          `INSERT INTO facilities (
            facility_type, source_key, source_id, name, address, phone, lat, lng,
            service_item, data_org, extra_json, synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            address = COALESCE(VALUES(address), address),
            phone = COALESCE(VALUES(phone), phone),
            lat = COALESCE(VALUES(lat), lat),
            lng = COALESCE(VALUES(lng), lng),
            service_item = VALUES(service_item),
            extra_json = VALUES(extra_json),
            updated_at = NOW()`,
          [
            "npo",
            "sheltered_workshop",
            String(item.id),
            item.name,
            item.address || city,
            item.phone || null,
            item.lat || null,
            item.lng || null,
            item.productNote,
            "庇護工場公益禮盒名冊",
            JSON.stringify(extraJson),
          ],
        );
        insertedCount++;
      }
    }
  } finally {
    await conn.end();
  }

  return { enrichedCount, insertedCount };
}

async function runRemoteIngestion(workshops) {
  console.log("🌐 Connecting via SSH loopback to execute ingestion on server...");
  const remoteScript = `
    const mysql = require("mysql2/promise");

    function normalizeOrgName(name) {
      if (!name) return "";
      let clean = name.trim();
      clean = clean
        .replace(/^(社團法人|財團法人|社團|財團)/g, "")
        .replace(/^(中華民國|台灣省|臺灣省|台灣|臺灣|台北市|臺北市|新北市|高雄市|台中市|臺中市|台南市|臺南市|桃園市)/g, "")
        .replace(/^(社團法人|財團法人)/g, "")
        .replace(/[（\\(][^）\\)]*[）\\)]/g, "")
        .replace(/[\\s\\-_—·・，,。.：:;；()（）\\[\\]【】「」『』]/g, "");
      return clean.toLowerCase();
    }

    (async () => {
      try {
        const conn = await mysql.createConnection({
          host: process.env.MYSQL_HOST || "127.0.0.1",
          port: Number(process.env.MYSQL_PORT) || 3306,
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
        });

        const workshops = ${JSON.stringify(workshops)};
        let enrichedCount = 0;
        let insertedCount = 0;

        for (const item of workshops) {
          const normalized = normalizeOrgName(item.name);
          const city = item.address || "全台灣";

          let matchedId = null;
          let matchedExtra = {};

          const [rows] = await conn.query(
            "SELECT id, name, extra_json FROM facilities WHERE (source_key = 'sheltered_workshop' AND source_id = ?) OR name = ? OR name LIKE ? LIMIT 10",
            [String(item.id), item.name, \`%\${normalized.slice(0, 5)}%\`]
          );

          for (const row of rows) {
            if (row.name === item.name) {
              matchedId = row.id;
              try {
                matchedExtra = typeof row.extra_json === "string" ? JSON.parse(row.extra_json) : row.extra_json || {};
              } catch {}
              break;
            }
          }

          if (!matchedId) {
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
              \`UPDATE facilities SET
                address = COALESCE(?, address),
                phone = COALESCE(?, phone),
                lat = COALESCE(?, lat),
                lng = COALESCE(?, lng),
                service_item = COALESCE(service_item, ?),
                extra_json = ?,
                synced_at = NOW(),
                updated_at = NOW()
               WHERE id = ?\`,
              [
                item.address || city,
                item.phone || null,
                item.lat || null,
                item.lng || null,
                item.productNote,
                JSON.stringify(extraJson),
                matchedId
              ]
            );
            enrichedCount++;
          } else {
            await conn.query(
              \`INSERT INTO facilities (
                facility_type, source_key, source_id, name, address, phone, lat, lng,
                service_item, data_org, extra_json, synced_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
              ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                address = COALESCE(VALUES(address), address),
                phone = COALESCE(VALUES(phone), phone),
                lat = COALESCE(VALUES(lat), lat),
                lng = COALESCE(VALUES(lng), lng),
                service_item = VALUES(service_item),
                extra_json = VALUES(extra_json),
                updated_at = NOW()\`,
              [
                "npo",
                "sheltered_workshop",
                String(item.id),
                item.name,
                item.address || city,
                item.phone || null,
                item.lat || null,
                item.lng || null,
                item.productNote,
                "庇護工場公益禮盒名冊",
                JSON.stringify(extraJson)
              ]
            );
            insertedCount++;
          }
        }

        await conn.end();
        console.log("RESULT_START" + JSON.stringify({ enrichedCount, insertedCount }) + "RESULT_END");
      } catch (err) {
        console.error("REMOTE_ERROR:", err.message);
        process.exit(1);
      }
    })();

  `;

  const output = runRemoteNode(remoteScript);
  const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
  if (!match) {
    throw new Error(`Failed to ingest on remote host: ${output}`);
  }
  return JSON.parse(match[1]);
}

async function main() {
  console.log(`[Sheltered Workshops] Starting ingestion. Dry run: ${DRY_RUN}`);

  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  const workshops = JSON.parse(raw);
  console.log(`[Sheltered Workshops] Loaded ${workshops.length} entries from ${DATA_FILE}`);

  if (DRY_RUN) {
    console.log("[DRY-RUN] Sample entries with address & coordinates:");
    workshops.slice(0, 5).forEach((item) => {
      console.log(`  #${item.id} ${item.name} | ${item.address} | 坐標: [${item.lat}, ${item.lng}] | ${item.storeUrl}`);
    });
    return;
  }

  let result = null;
  if (!FORCE_REMOTE) {
    try {
      result = await runLocalIngestion(workshops);
      console.log(`✅ 本地資料庫匯入成功！升級既有機構: ${result.enrichedCount}, 新增機構: ${result.insertedCount}`);
    } catch (err) {
      console.log(`⚠️ 本地資料庫連線失敗 (${err.message})，切換至遠端主機執行...`);
      result = await runRemoteIngestion(workshops);
      console.log(`✅ 遠端主機匯入成功！升級既有機構: ${result.enrichedCount}, 新增機構: ${result.insertedCount}`);
    }
  } else {
    result = await runRemoteIngestion(workshops);
    console.log(`✅ 遠端主機匯入成功！升級既有機構: ${result.enrichedCount}, 新增機構: ${result.insertedCount}`);
  }

  console.log(`🎉 61 家庇護工場公益禮盒與門牌座標全數入庫完成！`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[Sheltered Workshops] Error during ingestion:", err);
    process.exit(1);
  });
}
