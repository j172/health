#!/usr/bin/env node
/**
 * scripts/export-facilities-for-tgos.mjs
 *
 * Exports ungeocoded facilities (lat IS NULL AND address IS NOT NULL) to TGOS-compliant
 * batch CSV format (id, Address) with UTF-8 BOM.
 *
 * Usage:
 *   node scripts/export-facilities-for-tgos.mjs [--type=npo,tax_organization] [--limit=10000] [--batch-size=10000] [--out-dir=data/tgos] [--dry-run]
 *
 * Features:
 *   - Auto-detects local MySQL connection or transparently falls back to SSH remote query.
 *   - Prioritizes sheltered workshops / hasProducts and NPO Center organizations first.
 *   - Automatically slices into 10,000-row chunks matching TGOS daily batch limits.
 *   - Outputs UTF-8 with BOM (\uFEFF) to prevent encoding corruption in TGOS & Excel.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch {}
}

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const TYPE_FILTER = getArg("type", "npo,tax_organization");
const ALL_TYPES = args.includes("--all");
const LIMIT = Number(getArg("limit", "10000"));
const BATCH_SIZE = Number(getArg("batch-size", "10000"));
const OUT_DIR = path.resolve(process.cwd(), getArg("out-dir", "data/tgos"));
const DRY_RUN = args.includes("--dry-run");
const FORCE_REMOTE = args.includes("--remote");

export function cleanAddressForTgos(rawAddress) {
  if (!rawAddress) return "";
  let addr = String(rawAddress).trim();
  // Strip administrative notes, phone suffixes, floor notes in parentheses if helpful
  addr = addr.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  // Strip quotes to avoid CSV delimiter collisions
  addr = addr.replace(/"/g, "");
  return addr;
}

export function formatTgosCsv(rows) {
  const lines = ["id,Address"];
  for (const row of rows) {
    const cleanAddr = cleanAddressForTgos(row.address);
    if (!cleanAddr) continue;
    // Quote address if it contains comma
    const safeAddr = cleanAddr.includes(",") ? `"${cleanAddr}"` : cleanAddr;
    lines.push(`${row.id},${safeAddr}`);
  }
  // Prepend UTF-8 BOM
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
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

async function fetchRowsLocally(typeCondition, latCondition, limit) {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 5000,
  });

  const sql = `
    SELECT id, address, name
    FROM facilities
    WHERE address IS NOT NULL
      AND TRIM(address) != ''
      ${latCondition}
      ${typeCondition}
    ORDER BY
      CASE
        WHEN extra_json LIKE '%"hasProducts":true%' THEN 1
        WHEN source_key = 'npo_tw' THEN 2
        ELSE 3
      END ASC,
      id DESC
    LIMIT ?
  `;

  const [rows] = await conn.query(sql, [limit]);
  await conn.end();
  return rows;
}

async function fetchRowsRemotely(typeCondition, latCondition, limit) {
  console.log("🌐 Connecting via SSH loopback to fetch facilities...");
  const remoteScript = `
    const mysql = require("mysql2/promise");

    (async () => {
      try {
        const conn = await mysql.createConnection({
          host: process.env.MYSQL_HOST || "127.0.0.1",
          port: Number(process.env.MYSQL_PORT) || 3306,
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
        });

        const sql = \`
          SELECT id, address, name
          FROM facilities
          WHERE address IS NOT NULL
            AND TRIM(address) != ''
            ${latCondition}
            ${typeCondition}
          ORDER BY
            CASE
              WHEN extra_json LIKE '%"hasProducts":true%' THEN 1
              WHEN source_key = 'npo_tw' THEN 2
              ELSE 3
            END ASC,
            id DESC
          LIMIT ?
        \`;

        const [rows] = await conn.query(sql, [${limit}]);
        await conn.end();
        console.log("RESULT_START" + JSON.stringify(rows) + "RESULT_END");
      } catch (err) {
        console.error("REMOTE_ERROR:", err.message);
        process.exit(1);
      }
    })();
  `;

  const output = runRemoteNode(remoteScript);
  const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
  if (!match) {
    throw new Error(`Failed to extract results from remote host: ${output}`);
  }
  return JSON.parse(match[1]);
}

async function main() {
  console.log("==============================================================");
  console.log("  TGOS 批次門牌地址匯出工具 (Export Facilities for TGOS)");
  console.log("==============================================================");

  const INCLUDE_GEOCODED = args.includes("--include-geocoded");
  const latCondition = INCLUDE_GEOCODED ? "" : "AND lat IS NULL";

  let typeCondition = "";
  if (!ALL_TYPES && TYPE_FILTER) {
    const types = TYPE_FILTER.split(",").map((t) => `'${t.trim()}'`).join(",");
    typeCondition = `AND facility_type IN (${types})`;
    console.log(`📋 篩選設施類型：${TYPE_FILTER}`);
  } else {
    console.log(`📋 篩選全部設施類型 (${INCLUDE_GEOCODED ? "含已定位" : "lat IS NULL"})`);
  }

  console.log(`🎯 預計匯出上限：${LIMIT} 筆（單檔切分：${BATCH_SIZE} 筆）`);

  let rows = [];
  if (!FORCE_REMOTE) {
    try {
      rows = await fetchRowsLocally(typeCondition, latCondition, LIMIT);
      console.log(`✅ 本地資料庫查詢成功，取得 ${rows.length} 筆待定位地址。`);
    } catch (err) {
      console.log(`⚠️ 本地資料庫連線失敗 (${err.message})，切換至遠端主機查詢...`);
      rows = await fetchRowsRemotely(typeCondition, latCondition, LIMIT);
      console.log(`✅ 遠端主機查詢成功，取得 ${rows.length} 筆待定位地址。`);
    }
  } else {
    rows = await fetchRowsRemotely(typeCondition, latCondition, LIMIT);
    console.log(`✅ 遠端主機查詢成功，取得 ${rows.length} 筆待定位地址。`);
  }

  if (rows.length === 0) {
    console.log("🎉 目前沒有符合條件之未定位地址！");
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY-RUN] 前 5 筆預覽：`);
    rows.slice(0, 5).forEach((r, idx) => {
      console.log(`  #${idx + 1} ID: ${r.id} | 名稱: ${r.name} | 地址: ${cleanAddressForTgos(r.address)}`);
    });
    return;
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n📦 正在產生 TGOS 批次 CSV 檔案至目錄：${OUT_DIR}`);
  const generatedFiles = [];

  batches.forEach((batchRows, index) => {
    const filename = `tgos_pending_batch_${index + 1}.csv`;
    const filePath = path.join(OUT_DIR, filename);
    const csvContent = formatTgosCsv(batchRows);
    fs.writeFileSync(filePath, csvContent, "utf8");
    generatedFiles.push(filePath);
    console.log(`  ✓ 產出 [${filename}]: 共 ${batchRows.length} 筆 (大小: ${(csvContent.length / 1024).toFixed(1)} KB)`);
  });

  console.log("\n==============================================================");
  console.log("🎉 匯出完成！後續操作指引：");
  console.log("1. 登入 TGOS 平台「批次門牌地址比對服務」");
  console.log(`2. 依序上傳產出之 CSV 檔案（例如：${path.relative(process.cwd(), generatedFiles[0])}）`);
  console.log("3. 比對設定建議：");
  console.log("   - 輸出坐標系統：WGS84 (EPSG:4326) 或 TWD97");
  console.log("   - 模糊比對設定：啟用（最近門牌號與單雙號匹配）");
  console.log("4. 下載比對完成之結果 CSV 檔，接著執行匯入回寫：");
  console.log("   node scripts/import-tgos-geocode-results.mjs <下載結果檔案路徑>");
  console.log("==============================================================");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("❌ 匯出失敗:", err);
    process.exit(1);
  });
}
