#!/usr/bin/env node
/**
 * scripts/cleanup-cwa-rainfall-duplicates.mjs
 *
 * One-time cleanup for cwa_rainfall: the UNIQUE KEY is (station_id, obs_time),
 * so every sync cycle that sees a genuinely new obs_time INSERTs a new row
 * instead of overwriting the old one — the same bug pattern as
 * cwa_station_weather (see scripts/cleanup-cwa-station-weather-duplicates.mjs,
 * issue #378). Confirmed on production 2026-09-21: 2,968,147 rows across
 * 1,360 stations, 314MB.
 *
 * Unlike cwa_station_weather, this table isn't currently causing a
 * performance cliff — the nearest-reading queries (lib/server/cwa/queries.ts)
 * pre-filter to "each station's latest row in the last 3 hours" via a loose
 * index scan before ranking by distance, confirmed fast (~0.2s) by EXPLAIN.
 * This cleanup is preventive maintenance (reclaim space, stop relying on the
 * optimizer's luck), not an emergency fix. See
 * docs/specs/cwa-rainfall-duplicate-row-cleanup.md.
 *
 * This script keeps only the newest obs_time row per station_id (no
 * dataset_id column on this table, unlike cwa_station_weather) and deletes
 * the rest, in small batches to avoid holding a long lock on a live table
 * that a sync cron is also writing to.
 *
 * Unlike the cwa_station_weather script, this one does NOT back up the table
 * by default — the user explicitly decided no backup is needed for this
 * cleanup. Pass --backup to opt into creating one anyway.
 *
 * Usage:
 *   node scripts/cleanup-cwa-rainfall-duplicates.mjs                # dry-run (default)
 *   node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute      # actually delete, no backup
 *   node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute --batch-size=2000
 *   node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute --backup
 *   node scripts/cleanup-cwa-rainfall-duplicates.mjs --remote       # force SSH path
 *
 * Local .env's MYSQL_PASSWORD is known to be stale vs. what's actually
 * deployed on the host (confirmed again 2026-09-21), so this always falls
 * back to running over SSH against the server's own .env unless the local
 * connection happens to work.
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
const DRY_RUN = !EXECUTE;
const BATCH_SIZE = Number(getArg("batch-size", "2000"));
// This script's default is the opposite of cleanup-cwa-station-weather-duplicates.mjs:
// no backup unless --backup is explicitly passed.
const BACKUP = args.includes("--backup");
const FORCE_REMOTE = args.includes("--remote");
const TABLE = "cwa_rainfall";

function runRemoteNode(scriptCode) {
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

// Runs against a live mysql2 connection (either local or already-established
// on the remote host inside runRemoteNode's child process). Returns a summary.
async function cleanup(conn, { dryRun, batchSize, backup }) {
  const [[{ before_count: before }]] = await conn.query(`SELECT COUNT(*) AS before_count FROM ${TABLE}`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backupTable = `${TABLE}_backup_${stamp}`;
  let backedUp = false;

  await conn.query("DROP TEMPORARY TABLE IF EXISTS keep_latest");
  await conn.query(`
    CREATE TEMPORARY TABLE keep_latest AS
    SELECT station_id, MAX(obs_time) AS max_obs_time
    FROM ${TABLE}
    GROUP BY station_id
  `);
  await conn.query("DROP TEMPORARY TABLE IF EXISTS keep_ids");
  await conn.query(`
    CREATE TEMPORARY TABLE keep_ids AS
    SELECT t.id FROM ${TABLE} t
    JOIN keep_latest l
      ON t.station_id = l.station_id
     AND t.obs_time = l.max_obs_time
  `);
  await conn.query("ALTER TABLE keep_ids ADD PRIMARY KEY (id)");

  const [[{ keep }]] = await conn.query("SELECT COUNT(*) AS keep FROM keep_ids");
  const toDelete = before - keep;

  if (dryRun) {
    return { dryRun: true, before, keep, toDelete, backupTable: null, deleted: 0 };
  }

  if (backup) {
    await conn.query(`DROP TABLE IF EXISTS \`${backupTable}\``);
    await conn.query(`CREATE TABLE \`${backupTable}\` AS SELECT * FROM ${TABLE}`);
    backedUp = true;
  }

  let deleted = 0;
  for (;;) {
    const [result] = await conn.query(
      `DELETE FROM ${TABLE} WHERE id NOT IN (SELECT id FROM keep_ids) LIMIT ${Number(batchSize)}`
    );
    deleted += result.affectedRows;
    if (result.affectedRows === 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  await conn.query(`OPTIMIZE TABLE ${TABLE}`);
  const [[{ after_count: after }]] = await conn.query(`SELECT COUNT(*) AS after_count FROM ${TABLE}`);

  return { dryRun: false, before, keep, toDelete, deleted, after, backupTable: backedUp ? backupTable : null };
}

async function main() {
  console.log("==================================================================");
  console.log("  cwa_rainfall 重複列清理工具");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽,不刪除任何資料" : "⚡ [EXECUTE] 正式刪除重複列"}`);
  console.log(`批次大小: ${BATCH_SIZE}`);
  if (!DRY_RUN) console.log(`備份: ${BACKUP ? "✅ 刪除前會先建立完整備份表 (--backup)" : "❌ 未建立備份表 (預設行為,此次清理已確認不需要備份)"}`);

  let conn = null;
  let isRemote = FORCE_REMOTE;

  if (!FORCE_REMOTE) {
    try {
      conn = await getLocalConnection();
      console.log("✅ 成功連線至本機/直連 MySQL 資料庫。");
    } catch (err) {
      console.log(`⚠️ 本機資料庫連線失敗 (${err.message}),改用 SSH 遠端通道...`);
      isRemote = true;
    }
  }

  if (isRemote) {
    console.log("🌐 正在透過 SSH 通道在伺服器端執行...");
    const remoteScript = `
      const mysql = require("mysql2/promise");
      const TABLE = ${JSON.stringify(TABLE)};
      ${cleanup.toString()}
      (async () => {
        try {
          const conn = await mysql.createConnection({
            host: process.env.MYSQL_HOST || "127.0.0.1",
            port: Number(process.env.MYSQL_PORT) || 3306,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE,
            multipleStatements: false,
          });
          const res = await cleanup(conn, {
            dryRun: ${DRY_RUN ? "true" : "false"},
            batchSize: ${BATCH_SIZE},
            backup: ${BACKUP ? "true" : "false"},
          });
          await conn.end();
          console.log("RESULT_START" + JSON.stringify(res) + "RESULT_END");
        } catch (err) {
          console.error("REMOTE_ERROR:", err.message);
          process.exit(1);
        }
      })();
    `;
    const output = runRemoteNode(remoteScript);
    const match = output.match(/RESULT_START([\s\S]*?)RESULT_END/);
    if (!match) {
      throw new Error(`遠端執行失敗:\n${output}`);
    }
    report(JSON.parse(match[1]));
    return;
  }

  try {
    const res = await cleanup(conn, { dryRun: DRY_RUN, batchSize: BATCH_SIZE, backup: BACKUP });
    await conn.end();
    report(res);
  } catch (err) {
    if (conn) await conn.end();
    console.error("❌ 執行過程發生錯誤:", err);
    process.exit(1);
  }
}

function report(res) {
  console.log(`\n📊 目前總列數: ${res.before.toLocaleString()}`);
  console.log(`✅ 每站最新一筆將保留: ${res.keep.toLocaleString()}`);
  console.log(`🗑️ 判定為重複、可刪除: ${res.toDelete.toLocaleString()}`);
  if (res.dryRun) {
    console.log(`\nℹ️ [DRY-RUN] 若確認無誤,請加上 --execute 執行正式刪除。`);
    return;
  }
  console.log(`\n🗑️ 實際已刪除: ${res.deleted.toLocaleString()}`);
  console.log(`📉 刪除後總列數: ${res.after.toLocaleString()}`);
  if (res.backupTable) {
    console.log(`📦 完整備份表: ${res.backupTable}`);
  } else {
    console.log(`⚠️ 未建立備份表 (預設行為,此次清理已確認不需要備份)`);
  }
  console.log(`\n🎉 清理完成！`);
}

main();
