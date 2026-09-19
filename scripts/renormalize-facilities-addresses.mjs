#!/usr/bin/env node
/**
 * scripts/renormalize-facilities-addresses.mjs
 *
 * Normalizes facilities addresses and performs smart coordinate resets based on the
 * GRILL ME consensus:
 *  1. Normalizes address in-place:
 *     - Converts fullwidth digits to halfwidth
 *     - Strips parenthetical notes (e.g. "(1樓)", "（代表）", "【舊址】")
 *     - Deduplicates repeated county/district prefixes (e.g. "新北市土城區新北市土城區...")
 *     - Takes first address when separated by comma or "及"
 *     - Cleans whitespace and dangling punctuation
 *  2. Smart coordinate reset:
 *     - Official GPS sources (nhi_hospital, moe_kindergarten, ltc_contracted, etc.)
 *       have their existing lat/lng PRESERVED.
 *     - Non-whitelisted pure-address sources (npo_tw, cram_school, etc.) have their
 *       coordinates reset (lat=NULL, lng=NULL, geocode_attempts=0) so they can be
 *       precisely positioned by TGOS.
 *     - All unlocated rows (lat IS NULL) have geocode_attempts reset to 0.
 *  3. Safe operation:
 *     - Defaults to --dry-run (preview only, shows stats and diff samples).
 *     - Supports --create-backup to snapshot id, address, lat, lng, geocode_attempts.
 *     - Performs chunked batch updates (default 500 rows/batch) to avoid table lock.
 *
 * Usage:
 *   node scripts/renormalize-facilities-addresses.mjs [--dry-run]
 *   node scripts/renormalize-facilities-addresses.mjs --execute [--create-backup] [--batch-size=500] [--limit=1000]
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  normalizeFacilityAddress,
  dedupeAddressPrefix,
  shouldResetCoordinates,
  OFFICIAL_GPS_SOURCES,
} from "../lib/server/facilities/addressRules.mjs";

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

const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE || args.includes("--dry-run");
const CREATE_BACKUP = args.includes("--create-backup") || (EXECUTE && !args.includes("--no-backup"));
const BATCH_SIZE = Number(getArg("batch-size", "500"));
const LIMIT = args.find((a) => a.startsWith("--limit=")) ? Number(getArg("limit", "0")) : 0;
const FORCE_REMOTE = args.includes("--remote");

export function runRemoteNode(scriptCode) {
  const sshUser = process.env.SSH_USER || "tw123457";
  const sshHost = process.env.SSH_HOST || "103.21.221.12";
  const sshKey = path.resolve(process.cwd(), ".ssh/health_host_id_rsa");
  if (!fs.existsSync(sshKey)) {
    throw new Error(`SSH Key not found at ${sshKey}`);
  }
  const cmd = `ssh -i "${sshKey}" -p 22 -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${sshUser}@${sshHost} "cd /home/tw123457/health_app && node --env-file=.env"`;
  return execSync(cmd, { input: scriptCode, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}

async function getLocalConnection() {
  return await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: process.env.MYSQL_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 5000,
  });
}

async function scanAndProcess() {
  console.log("==================================================================");
  console.log("  機構地址正規化與座標智慧重算工具 (Normalize & Smart Geocode Reset)");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽分析，不更動資料庫" : "⚡ [EXECUTE] 正式落盤更新"}`);
  console.log(`分批大小: ${BATCH_SIZE} 筆/批`);
  if (LIMIT > 0) console.log(`筆數限制: ${LIMIT} 筆`);
  console.log("------------------------------------------------------------------");

  let conn = null;
  let isRemote = false;

  if (!FORCE_REMOTE) {
    try {
      conn = await getLocalConnection();
      console.log("✅ 成功連線至本機 MySQL 資料庫。");
    } catch (err) {
      console.log(`⚠️ 本機資料庫連線失敗 (${err.message})，準備使用遠端通道...`);
      isRemote = true;
    }
  } else {
    isRemote = true;
  }

  if (isRemote) {
    console.log("🌐 正在透過 SSH 通道在伺服器端執行分析與更新流程...");
    const remoteScript = `
      const mysql = require("mysql2/promise");
      const path = require("path");

      ${normalizeFacilityAddress.toString()}
      ${dedupeAddressPrefix.toString()}
      const OFFICIAL_GPS_SOURCES = new Set(${JSON.stringify(Array.from(OFFICIAL_GPS_SOURCES))});
      ${shouldResetCoordinates.toString()}

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

          // Fetch facilities
          const limitClause = "${LIMIT > 0 ? `LIMIT ${LIMIT}` : ""}";
          const [rows] = await conn.query(\`
            SELECT id, source_key, facility_type, name, address, lat, lng, geocode_attempts
            FROM facilities
            WHERE address IS NOT NULL AND TRIM(address) != ''
            \${limitClause}
          \`);

          let addressChanged = 0;
          let coordsReset = 0;
          let coordsPreserved = 0;
          const samples = [];
          const sourceStats = {};
          const toUpdateReset = [];
          const toUpdateAddrOnly = [];

          for (const row of rows) {
            const normalized = normalizeFacilityAddress(row.address);
            const addrDifferent = normalized !== row.address;
            const mustResetCoords = shouldResetCoordinates(row.source_key, row.lat);

            if (!sourceStats[row.source_key]) {
              sourceStats[row.source_key] = { total: 0, addrChanged: 0, coordsReset: 0, coordsPreserved: 0 };
            }
            sourceStats[row.source_key].total++;

            if (addrDifferent) {
              addressChanged++;
              sourceStats[row.source_key].addrChanged++;
            }

            if (mustResetCoords) {
              // If coords are not null or attempts > 0, it needs reset
              if (row.lat !== null || row.lng !== null || row.geocode_attempts > 0) {
                coordsReset++;
                sourceStats[row.source_key].coordsReset++;
                toUpdateReset.push({ id: row.id, address: normalized });
              } else if (addrDifferent) {
                // lat already null and attempts == 0, but address changed
                toUpdateReset.push({ id: row.id, address: normalized });
              }
            } else {
              coordsPreserved++;
              sourceStats[row.source_key].coordsPreserved++;
              if (addrDifferent) {
                toUpdateAddrOnly.push({ id: row.id, address: normalized });
              }
            }

            if ((addrDifferent || (mustResetCoords && row.lat !== null)) && samples.length < 25) {
              samples.push({
                id: row.id,
                name: row.name,
                source_key: row.source_key,
                original_address: row.address,
                normalized_address: normalized,
                addrChanged: addrDifferent,
                resetCoords: mustResetCoords && row.lat !== null,
                lat: row.lat,
                lng: row.lng,
              });
            }
          }

          const stats = {
            totalScanned: rows.length,
            addressChanged,
            coordsReset,
            coordsPreserved,
            toUpdateResetCount: toUpdateReset.length,
            toUpdateAddrOnlyCount: toUpdateAddrOnly.length,
            sourceStats,
            samples,
          };

          ${
            !DRY_RUN && CREATE_BACKUP
              ? `
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const backupTable = \`facilities_geo_backup_\${dateStr}\`;
            console.error("Creating backup table: " + backupTable);
            await conn.query(\`
              CREATE TABLE IF NOT EXISTS \${backupTable} AS
              SELECT id, address, lat, lng, geocode_attempts
              FROM facilities
            \`);
            stats.backupTable = backupTable;
          `
              : ""
          }

          ${
            !DRY_RUN
              ? `
            console.error("Executing chunked updates...");
            // Execute updates for coords reset + address
            const CHUNK = ${BATCH_SIZE};
            let updatedCount = 0;
            for (let i = 0; i < toUpdateReset.length; i += CHUNK) {
              const chunk = toUpdateReset.slice(i, i + CHUNK);
              for (const item of chunk) {
                await conn.query(
                  "UPDATE facilities SET address = ?, lat = NULL, lng = NULL, geocode_attempts = 0, updated_at = NOW() WHERE id = ?",
                  [item.address, item.id]
                );
                updatedCount++;
              }
            }

            // Execute updates for address only (preserving official coords)
            for (let i = 0; i < toUpdateAddrOnly.length; i += CHUNK) {
              const chunk = toUpdateAddrOnly.slice(i, i + CHUNK);
              for (const item of chunk) {
                await conn.query(
                  "UPDATE facilities SET address = ?, updated_at = NOW() WHERE id = ?",
                  [item.address, item.id]
                );
                updatedCount++;
              }
            }
            stats.actuallyUpdated = updatedCount;
          `
              : ""
          }

          await conn.end();
          console.log("RESULT_START" + JSON.stringify(stats) + "RESULT_END");
        } catch (err) {
          console.error("REMOTE_ERROR:", err.message, err.stack);
          process.exit(1);
        }
      })();
    `;

    const output = runRemoteNode(remoteScript);
    const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
    if (!match) {
      throw new Error(`遠端執行回傳解析失敗:\n${output}`);
    }
    const stats = JSON.parse(match[1]);
    displayStats(stats);
    return;
  }

  // Local connection execution
  try {
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : "";
    const [rows] = await conn.query(`
      SELECT id, source_key, facility_type, name, address, lat, lng, geocode_attempts
      FROM facilities
      WHERE address IS NOT NULL AND TRIM(address) != ''
      ${limitClause}
    `);

    let addressChanged = 0;
    let coordsReset = 0;
    let coordsPreserved = 0;
    const samples = [];
    const sourceStats = {};
    const toUpdateReset = [];
    const toUpdateAddrOnly = [];

    for (const row of rows) {
      const normalized = normalizeFacilityAddress(row.address);
      const addrDifferent = normalized !== row.address;
      const mustResetCoords = shouldResetCoordinates(row.source_key, row.lat);

      if (!sourceStats[row.source_key]) {
        sourceStats[row.source_key] = { total: 0, addrChanged: 0, coordsReset: 0, coordsPreserved: 0 };
      }
      sourceStats[row.source_key].total++;

      if (addrDifferent) {
        addressChanged++;
        sourceStats[row.source_key].addrChanged++;
      }

      if (mustResetCoords) {
        if (row.lat !== null || row.lng !== null || row.geocode_attempts > 0) {
          coordsReset++;
          sourceStats[row.source_key].coordsReset++;
          toUpdateReset.push({ id: row.id, address: normalized });
        } else if (addrDifferent) {
          toUpdateReset.push({ id: row.id, address: normalized });
        }
      } else {
        coordsPreserved++;
        sourceStats[row.source_key].coordsPreserved++;
        if (addrDifferent) {
          toUpdateAddrOnly.push({ id: row.id, address: normalized });
        }
      }

      if ((addrDifferent || (mustResetCoords && row.lat !== null)) && samples.length < 25) {
        samples.push({
          id: row.id,
          name: row.name,
          source_key: row.source_key,
          original_address: row.address,
          normalized_address: normalized,
          addrChanged: addrDifferent,
          resetCoords: mustResetCoords && row.lat !== null,
          lat: row.lat,
          lng: row.lng,
        });
      }
    }

    const stats = {
      totalScanned: rows.length,
      addressChanged,
      coordsReset,
      coordsPreserved,
      toUpdateResetCount: toUpdateReset.length,
      toUpdateAddrOnlyCount: toUpdateAddrOnly.length,
      sourceStats,
      samples,
    };

    if (!DRY_RUN && CREATE_BACKUP) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const backupTable = `facilities_geo_backup_${dateStr}`;
      console.log(`📦 正在建立資料庫快照備份表: ${backupTable} ...`);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${backupTable} AS
        SELECT id, address, lat, lng, geocode_attempts
        FROM facilities
      `);
      console.log(`✅ 備份表 ${backupTable} 建立完成！`);
      stats.backupTable = backupTable;
    }

    if (!DRY_RUN) {
      console.log(`\n⚡ 正在分批更新資料庫 (每批 ${BATCH_SIZE} 筆)...`);
      let updatedCount = 0;

      // 1. Coords reset + address update
      for (let i = 0; i < toUpdateReset.length; i += BATCH_SIZE) {
        const chunk = toUpdateReset.slice(i, i + BATCH_SIZE);
        for (const item of chunk) {
          await conn.query(
            "UPDATE facilities SET address = ?, lat = NULL, lng = NULL, geocode_attempts = 0, updated_at = NOW() WHERE id = ?",
            [item.address, item.id]
          );
          updatedCount++;
        }
        process.stdout.write(`  [更新進度 (需重定位組)]: ${updatedCount} / ${toUpdateReset.length}\r`);
      }
      console.log(`\n  ✓ 需重定位組更新完成: ${toUpdateReset.length} 筆`);

      // 2. Address only update (preserving official coords)
      let addrOnlyCount = 0;
      for (let i = 0; i < toUpdateAddrOnly.length; i += BATCH_SIZE) {
        const chunk = toUpdateAddrOnly.slice(i, i + BATCH_SIZE);
        for (const item of chunk) {
          await conn.query(
            "UPDATE facilities SET address = ?, updated_at = NOW() WHERE id = ?",
            [item.address, item.id]
          );
          addrOnlyCount++;
        }
        process.stdout.write(`  [更新進度 (保留官方座標組)]: ${addrOnlyCount} / ${toUpdateAddrOnly.length}\r`);
      }
      console.log(`\n  ✓ 保留官方座標組地址更新完成: ${toUpdateAddrOnly.length} 筆`);

      stats.actuallyUpdated = updatedCount + addrOnlyCount;
    }

    await conn.end();
    displayStats(stats);
  } catch (err) {
    if (conn) await conn.end();
    console.error("❌ 執行過程發生錯誤:", err);
    process.exit(1);
  }
}

function displayStats(stats) {
  console.log("\n======================== 執行統計報告 ========================");
  console.log(`總掃描筆數: ${stats.totalScanned.toLocaleString()} 筆`);
  console.log(`地址格式需正規化筆數: ${stats.addressChanged.toLocaleString()} 筆 (${((stats.addressChanged / (stats.totalScanned || 1)) * 100).toFixed(1)}%)`);
  console.log(`推算座標需重置筆數: ${stats.coordsReset.toLocaleString()} 筆`);
  console.log(`官方 GPS 座標完整保留筆數: ${stats.coordsPreserved.toLocaleString()} 筆`);
  if (stats.backupTable) {
    console.log(`快照備份表: ${stats.backupTable}`);
  }
  if (stats.actuallyUpdated !== undefined) {
    console.log(`🎉 實際寫入更新筆數: ${stats.actuallyUpdated.toLocaleString()} 筆`);
  }

  console.log("\n--- 各來源統計 (前 15 筆) ---");
  const sortedSources = Object.entries(stats.sourceStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);

  console.log("來源代碼 (Source Key)       | 總筆數  | 地址變更 | 座標重置 | 官方保留");
  console.log("----------------------------+---------+----------+----------+---------");
  for (const [key, s] of sortedSources) {
    const isOfficial = OFFICIAL_GPS_SOURCES.has(key) ? " [官方]" : "";
    const nameCol = (key + isOfficial).padEnd(27, " ");
    const totalCol = String(s.total).padStart(7, " ");
    const addrCol = String(s.addrChanged).padStart(8, " ");
    const resetCol = String(s.coordsReset).padStart(8, " ");
    const presCol = String(s.coordsPreserved).padStart(8, " ");
    console.log(`${nameCol} | ${totalCol} | ${addrCol} | ${resetCol} | ${presCol}`);
  }

  console.log("\n--- 前後對照樣本預覽 (Diff Samples) ---");
  stats.samples.slice(0, 15).forEach((sample, idx) => {
    console.log(`\n[範例 #${idx + 1}] ID: ${sample.id} (${sample.name || "未命名"}) [${sample.source_key}]`);
    if (sample.addrChanged) {
      console.log(`  - 原始地址: "${sample.original_address}"`);
      console.log(`  + 正規地址: "${sample.normalized_address}"`);
    } else {
      console.log(`  = 地址未變: "${sample.original_address}"`);
    }
    if (sample.resetCoords) {
      console.log(`  ↺ 座標重置: 舊座標 (${sample.lat}, ${sample.lng}) -> 重設為 NULL (待 TGOS 重新定位)`);
    } else {
      console.log(`  🔒 座標狀態: 保留原座標或原為 NULL`);
    }
  });
  console.log("==============================================================");
}

scanAndProcess();
