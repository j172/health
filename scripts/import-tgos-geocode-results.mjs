#!/usr/bin/env node
/**
 * scripts/import-tgos-geocode-results.mjs
 *
 * Ingests TGOS batch geocoding result CSV files and updates facilities table
 * with high-precision coordinates (lat, lng) and matched addresses.
 *
 * Usage:
 *   node scripts/import-tgos-geocode-results.mjs <tgos_result.csv> [--dry-run] [--remote]
 *
 * Features:
 *   - Auto-detects columns: ID, Response_Address, Response_X, Response_Y (or X, Y, WGS84/TWD97).
 *   - Auto-converts TWD97 (EPSG:3826) to WGS84 (EPSG:4326) if meters were exported.
 *   - Performs Taiwan geographic bounding box validation.
 *   - High-throughput chunked DB batch updates with dry-run support.
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
const csvFileArg = args.find((a) => !a.startsWith("--"));
const DRY_RUN = args.includes("--dry-run");
const FORCE_REMOTE = args.includes("--remote");

export const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 };

export function isWithinTaiwanBounds(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= TAIWAN_BOUNDS.minLat &&
    lat <= TAIWAN_BOUNDS.maxLat &&
    lng >= TAIWAN_BOUNDS.minLng &&
    lng <= TAIWAN_BOUNDS.maxLng
  );
}

/**
 * Converts TWD97 2-degree Transverse Mercator (EPSG:3826) in meters to WGS84 (EPSG:4326) in degrees.
 */
export function twd97ToWgs84(x, y) {
  const a = 6378137.0;
  const b = 6356752.314245;
  const lng0 = (121 * Math.PI) / 180;
  const k0 = 0.9999;
  const dx = 250000;
  const dy = 0;
  const e = Math.sqrt(1 - (b * b) / (a * a));

  x -= dx;
  y -= dy;

  const M = y / k0;
  const mu = M / (a * (1 - (e * e) / 4 - (3 * e * e * e * e) / 64 - (5 * e * e * e * e * e * e) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));

  const J1 = (3 * e1) / 2 - (27 * e1 * e1 * e1) / 32;
  const J2 = (21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32;
  const J3 = (151 * e1 * e1 * e1) / 96;
  const J4 = (1097 * e1 * e1 * e1 * e1) / 512;

  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);

  const e2 = Math.sqrt((a * a - b * b) / (b * b));
  const C1 = e2 * e2 * Math.cos(fp) * Math.cos(fp);
  const T1 = Math.tan(fp) * Math.tan(fp);
  const R1 = (a * (1 - e * e)) / Math.pow(1 - e * e * Math.sin(fp) * Math.sin(fp), 1.5);
  const N1 = a / Math.sqrt(1 - e * e * Math.sin(fp) * Math.sin(fp));

  const D = x / (N1 * k0);

  const Q1 = (N1 * Math.tan(fp)) / R1;
  const Q2 = (D * D) / 2;
  const Q3 = ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2 * e2) * Math.pow(D, 4)) / 24;
  const Q4 = ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2 * e2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720;
  const lat = fp - Q1 * (Q2 - Q3 + Q4);

  const Q5 = D;
  const Q6 = ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6;
  const Q7 = ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2 * e2 + 24 * T1 * T1) * Math.pow(D, 5)) / 120;
  const lng = lng0 + (Q5 - Q6 + Q7) / Math.cos(fp);

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lng * 180) / Math.PI,
  };
}

/**
 * Parses CSV lines into string arrays respecting quotes and BOM.
 */
export function parseCsvRows(csvContent) {
  let content = csvContent.replace(/^\uFEFF/, "");
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.length > 0 && r.some((field) => field.length > 0));
}

export function parseTgosResultCsv(csvContent) {
  const rows = parseCsvRows(csvContent);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().replace(/[\s_]/g, ""));

  // Find column indices
  const findCol = (candidates) => {
    for (const cand of candidates) {
      const idx = headers.findIndex((h) => h === cand || h.includes(cand));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idIdx = findCol(["id", "序號", "編號"]);
  const addrIdx = findCol(["responseaddress", "比對門牌", "比對地址", "fulladdr", "matchaddress", "門牌地址"]);
  const xIdx = findCol(["responsex", "x", "lng", "lon", "經度"]);
  const yIdx = findCol(["responsey", "y", "lat", "緯度"]);

  if (idIdx === -1 || xIdx === -1 || yIdx === -1) {
    throw new Error(
      `無法識別 TGOS 結果 CSV 欄位。找到標題：${rows[0].join(", ")}。需要包含 id, X, Y (或 Response_X, Response_Y)`,
    );
  }

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawId = row[idIdx];
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;

    const rawX = Number(row[xIdx]);
    const rawY = Number(row[yIdx]);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || (rawX === 0 && rawY === 0)) {
      continue;
    }

    let lat = rawY;
    let lng = rawX;

    // If TWD97 projected coordinates (meters)
    if (rawX > 100000 && rawY > 1000000) {
      const converted = twd97ToWgs84(rawX, rawY);
      lat = converted.lat;
      lng = converted.lng;
    }

    // Precision rounding (7 decimal places ~1.1cm)
    lat = Number(lat.toFixed(7));
    lng = Number(lng.toFixed(7));

    if (!isWithinTaiwanBounds(lat, lng)) {
      continue;
    }

    const responseAddress = addrIdx !== -1 ? row[addrIdx] : null;

    items.push({
      id,
      lat,
      lng,
      responseAddress: responseAddress || null,
    });
  }

  return items;
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

async function updateLocally(items) {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 5000,
  });

  const CHUNK_SIZE = 100;
  let updatedTotal = 0;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    for (const item of chunk) {
      await conn.query(
        `UPDATE facilities
         SET lat = ?, lng = ?, updated_at = NOW()
         WHERE id = ?`,
        [item.lat, item.lng, item.id],
      );
      updatedTotal++;
    }
  }

  await conn.end();
  return updatedTotal;
}

async function updateRemotely(items) {
  console.log("🌐 Connecting via SSH loopback to update facilities on server...");
  const remoteScript = `
    const mysql = require("mysql2/promise");
    const fs = require("fs");
    const path = require("path");

    (async () => {
      try {
        if (typeof process.loadEnvFile === "function") {
          try { process.loadEnvFile(path.resolve(__dirname, ".env")); } catch {}
        }
        const conn = await mysql.createConnection({
          host: process.env.MYSQL_HOST || "127.0.0.1",
          port: Number(process.env.MYSQL_PORT) || 3306,
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
        });

        const items = ${JSON.stringify(items)};
        let updated = 0;

        for (const item of items) {
          await conn.query(
            "UPDATE facilities SET lat = ?, lng = ?, updated_at = NOW() WHERE id = ?",
            [item.lat, item.lng, item.id]
          );
          updated++;
        }

        await conn.end();
        console.log("RESULT_START" + JSON.stringify({ updated }) + "RESULT_END");
      } catch (err) {
        console.error("REMOTE_ERROR:", err.message);
        process.exit(1);
      }
    })();
  `;

  const output = runRemoteNode(remoteScript);
  const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
  if (!match) {
    throw new Error(`Failed to update on remote host: ${output}`);
  }
  const res = JSON.parse(match[1]);
  return res.updated;
}

async function main() {
  console.log("==============================================================");
  console.log("  TGOS 批次門牌比對結果匯入工具 (Import TGOS Geocode Results)");
  console.log("==============================================================");

  if (!csvFileArg) {
    console.error("❌ 請指定 TGOS 結果 CSV 檔案路徑。");
    console.error("用法範例：node scripts/import-tgos-geocode-results.mjs data/tgos_result.csv [--dry-run]");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), csvFileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 找不到檔案：${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf8");
  console.log(`📂 讀取檔案：${path.basename(filePath)} (${(content.length / 1024).toFixed(1)} KB)`);

  const items = parseTgosResultCsv(content);
  console.log(`🔍 解析出有效臺灣邊界坐標項目：${items.length} 筆`);

  if (items.length === 0) {
    console.warn("⚠️ 沒有找到任何有效坐標項目，請檢查 CSV 檔案格式。");
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] 前 5 筆轉換預覽：`);
    items.slice(0, 5).forEach((item, idx) => {
      console.log(
        `  #${idx + 1} ID: ${item.id} -> 經度: ${item.lng}, 緯度: ${item.lat}${item.responseAddress ? ` (${item.responseAddress})` : ""}`,
      );
    });
    console.log(`\n[DRY-RUN] 模擬結束，未寫入資料庫。移除 --dry-run 即可正式回寫。`);
    return;
  }

  console.log(`\n💾 正在將 ${items.length} 筆坐標批次回寫入 facilities 資料庫...`);
  let updatedCount = 0;

  if (!FORCE_REMOTE) {
    try {
      updatedCount = await updateLocally(items);
      console.log(`✅ 本地資料庫更新成功：共更新 ${updatedCount} 筆據點座標。`);
    } catch (err) {
      console.log(`⚠️ 本地資料庫連線失敗 (${err.message})，切換至遠端主機回寫...`);
      updatedCount = await updateRemotely(items);
      console.log(`✅ 遠端主機更新成功：共更新 ${updatedCount} 筆據點座標。`);
    }
  } else {
    updatedCount = await updateRemotely(items);
    console.log(`✅ 遠端主機更新成功：共更新 ${updatedCount} 筆據點座標。`);
  }

  console.log("\n==============================================================");
  console.log(`🎉 匯入完成！成功回寫 ${updatedCount} / ${items.length} 筆門牌座標。`);
  console.log("==============================================================");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("❌ 匯入失敗:", err);
    process.exit(1);
  });
}
