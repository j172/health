#!/usr/bin/env node
/**
 * scripts/rollback-facilities-addresses.mjs
 *
 * Restores original facilities address and coordinates from a backup table
 * (e.g. facilities_geo_backup_YYYYMMDD).
 *
 * Usage:
 *   node scripts/rollback-facilities-addresses.mjs [--table=facilities_geo_backup_YYYYMMDD] [--dry-run]
 *   node scripts/rollback-facilities-addresses.mjs --execute [--table=facilities_geo_backup_YYYYMMDD]
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

const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE || args.includes("--dry-run");
const TABLE_ARG = getArg("table", "");
const BATCH_SIZE = Number(getArg("batch-size", "500"));
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

async function runRollback() {
  console.log("==================================================================");
  console.log("  機構地址與座標復原工具 (Facilities Address & Geo Rollback)");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽分析，不執行還原" : "⚡ [EXECUTE] 正式還原寫入"}`);

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
    console.log("🌐 正在透過 SSH 通道在伺服器端檢查備份表並執行復原...");
    const remoteScript = `
      const mysql = require("mysql2/promise");
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

          let targetTable = "${TABLE_ARG}";
          if (!targetTable) {
            const [tables] = await conn.query("SHOW TABLES LIKE 'facilities_geo_backup_%'");
            if (tables.length === 0) {
              await conn.end();
              console.log("RESULT_START" + JSON.stringify({ noBackup: true }) + "RESULT_END");
              return;
            }
            targetTable = Object.values(tables[tables.length - 1])[0];
          }

          const [countRes] = await conn.query(\`SELECT COUNT(*) as total FROM \${targetTable}\`);
          const totalRows = countRes[0].total;

          let restored = 0;
          ${
            !DRY_RUN
              ? `
            console.error("Restoring from " + targetTable + " (" + totalRows + " rows)...");
            await conn.query(\`
              UPDATE facilities f
              JOIN \${targetTable} b ON f.id = b.id
              SET f.address = b.address,
                  f.lat = b.lat,
                  f.lng = b.lng,
                  f.geocode_attempts = b.geocode_attempts,
                  f.updated_at = NOW()
            \`);
            restored = totalRows;
          `
              : ""
          }

          await conn.end();
          console.log("RESULT_START" + JSON.stringify({ targetTable, totalRows, restored }) + "RESULT_END");
        } catch (err) {
          console.error("REMOTE_ERROR:", err.message);
          process.exit(1);
        }
      })();
    `;

    const output = runRemoteNode(remoteScript);
    const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
    if (!match) {
      throw new Error(`遠端復原執行失敗:\n${output}`);
    }
    const res = JSON.parse(match[1]);
    if (res.noBackup) {
      console.log("\n⚠️ 目前資料庫中尚未建立任何備份表 (facilities_geo_backup_*)。");
      return;
    }
    console.log(`\n🎯 目標備份表: ${res.targetTable}`);
    console.log(`📦 備份筆數: ${res.totalRows.toLocaleString()} 筆`);
    if (!DRY_RUN) {
      console.log(`🎉 復原完成，已將資料全數還原！`);
    } else {
      console.log(`ℹ️ [DRY-RUN] 若確認還原，請傳入 --execute 執行。`);
    }
    return;
  }

  // Local execution
  try {
    let targetTable = TABLE_ARG;
    if (!targetTable) {
      const [tables] = await conn.query("SHOW TABLES LIKE 'facilities_geo_backup_%'");
      if (tables.length === 0) {
        throw new Error("找不到任何備份表 (facilities_geo_backup_*)");
      }
      targetTable = Object.values(tables[tables.length - 1])[0];
    }

    const [countRes] = await conn.query(`SELECT COUNT(*) as total FROM ${targetTable}`);
    const totalRows = countRes[0].total;
    console.log(`\n🎯 目標備份表: ${targetTable}`);
    console.log(`📦 備份筆數: ${totalRows.toLocaleString()} 筆`);

    if (!DRY_RUN) {
      console.log(`⚡ 正在從 ${targetTable} 還原資料至 facilities...`);
      await conn.query(`
        UPDATE facilities f
        JOIN ${targetTable} b ON f.id = b.id
        SET f.address = b.address,
            f.lat = b.lat,
            f.lng = b.lng,
            f.geocode_attempts = b.geocode_attempts,
            f.updated_at = NOW()
      `);
      console.log(`🎉 復原完成，已將資料全數還原！`);
    } else {
      console.log(`ℹ️ [DRY-RUN] 檢驗正常。若確認還原，請傳入 --execute 執行。`);
    }
    await conn.end();
  } catch (err) {
    if (conn) await conn.end();
    console.error("❌ 復原過程發生錯誤:", err);
    process.exit(1);
  }
}

runRollback();
