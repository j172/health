#!/usr/bin/env node
/**
 * scripts/cleanup-global-earthquakes-backlog.mjs
 *
 * One-time cleanup for global_earthquakes (issue #582): the table had no
 * write threshold and no retention limit, so USGS's `all_hour` feed (every
 * microquake, e.g. a M0.5 in California) and EMSC's 100-events-per-poll pull
 * both wrote rows that no reader (earthquakes tool page, its foreign-
 * language variants, the homepage status widget — all capped at 168 hours
 * lookback, M4.0+/M6.0+ display floors) ever shows. This script deletes the
 * existing backlog that's below the new write threshold (M2.5, or NULL
 * magnitude) or older than the new retention window (30 days), now that the
 * app-level fix (write threshold in runSync.ts + daily retention cron in
 * registerJobs.ts) is in place to stop it from reaccumulating.
 *
 * Same batched-delete-with-backup pattern as
 * scripts/cleanup-cwa-station-weather-duplicates.mjs /
 * scripts/cleanup-cwa-rainfall-duplicates.mjs / scripts/cleanup-aqi-pm25-duplicates.mjs.
 *
 * Usage:
 *   node scripts/cleanup-global-earthquakes-backlog.mjs                # dry-run (default)
 *   node scripts/cleanup-global-earthquakes-backlog.mjs --execute      # actually delete
 *   node scripts/cleanup-global-earthquakes-backlog.mjs --execute --batch-size=2000
 *   node scripts/cleanup-global-earthquakes-backlog.mjs --execute --no-backup
 *   node scripts/cleanup-global-earthquakes-backlog.mjs --remote       # force SSH path
 *
 * NOTE: this script has NOT been run against production as part of issue
 * #582 — it's left as a manual step for a human to run (dry-run first) after
 * this PR merges and deploys. Local .env's MYSQL_PASSWORD is known to be
 * stale vs. what's actually deployed on the host (confirmed repeatedly, see
 * ops_secrets_handling_policy / ops_static_map_svg_migration_gap), so this
 * always falls back to running over SSH against the server's own .env
 * unless the local connection happens to work.
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
const NO_BACKUP = args.includes("--no-backup");
const FORCE_REMOTE = args.includes("--remote");
const TABLE = "global_earthquakes";
const MIN_WRITE_MAGNITUDE = 2.5; // keep in sync with lib/server/earthquakes/writeThreshold.ts
const RETENTION_DAYS = 30; // keep in sync with lib/server/earthquakes/runRetentionCleanup.ts

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
  const [[{ sub_threshold: subThreshold }]] = await conn.query(
    `SELECT COUNT(*) AS sub_threshold FROM ${TABLE} WHERE magnitude IS NULL OR magnitude < ?`,
    [MIN_WRITE_MAGNITUDE],
  );
  const [[{ stale: stale }]] = await conn.query(
    `SELECT COUNT(*) AS stale FROM ${TABLE} WHERE event_time < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
    [RETENTION_DAYS],
  );
  const [[{ oldest_event_time: oldestEventTime }]] = await conn.query(`SELECT MIN(event_time) AS oldest_event_time FROM ${TABLE}`);
  const [[{ to_delete: toDelete }]] = await conn.query(
    `SELECT COUNT(*) AS to_delete FROM ${TABLE}
     WHERE magnitude IS NULL OR magnitude < ? OR event_time < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`,
    [MIN_WRITE_MAGNITUDE, RETENTION_DAYS],
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backupTable = `${TABLE}_backup_${stamp}`;
  let backedUp = false;

  if (dryRun) {
    return { dryRun: true, before, subThreshold, stale, oldestEventTime, toDelete, backupTable: null, deleted: 0, after: before };
  }

  if (backup) {
    await conn.query(`DROP TABLE IF EXISTS \`${backupTable}\``);
    await conn.query(`CREATE TABLE \`${backupTable}\` AS SELECT * FROM ${TABLE}`);
    backedUp = true;
  }

  let deleted = 0;
  for (;;) {
    const [result] = await conn.query(
      `DELETE FROM ${TABLE}
       WHERE magnitude IS NULL OR magnitude < ? OR event_time < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
       LIMIT ${Number(batchSize)}`,
      [MIN_WRITE_MAGNITUDE, RETENTION_DAYS],
    );
    deleted += result.affectedRows;
    if (result.affectedRows === 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  await conn.query(`OPTIMIZE TABLE ${TABLE}`);
  const [[{ after_count: after }]] = await conn.query(`SELECT COUNT(*) AS after_count FROM ${TABLE}`);

  return { dryRun: false, before, subThreshold, stale, oldestEventTime, toDelete, deleted, after, backupTable: backedUp ? backupTable : null };
}

async function main() {
  console.log("==================================================================");
  console.log("  global_earthquakes 既有 backlog 清理工具 (issue #582)");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽，不刪除任何資料" : "⚡ [EXECUTE] 正式刪除"}`);
  console.log(`批次大小: ${BATCH_SIZE}`);
  console.log(`寫入門檻: M${MIN_WRITE_MAGNITUDE} / 保留期: ${RETENTION_DAYS} 天`);
  if (!DRY_RUN) console.log(`備份: ${NO_BACKUP ? "❌ 已停用 (--no-backup)" : "✅ 刪除前會先建立完整備份表"}`);

  let conn = null;
  let isRemote = FORCE_REMOTE;

  if (!FORCE_REMOTE) {
    try {
      conn = await getLocalConnection();
      console.log("✅ 成功連線至本機/直連 MySQL 資料庫。");
    } catch (err) {
      console.log(`⚠️ 本機資料庫連線失敗 (${err.message})，改用 SSH 遠端通道...`);
      isRemote = true;
    }
  }

  if (isRemote) {
    console.log("🌐 正在透過 SSH 通道在伺服器端執行...");
    const remoteScript = `
      const mysql = require("mysql2/promise");
      const TABLE = ${JSON.stringify(TABLE)};
      const MIN_WRITE_MAGNITUDE = ${MIN_WRITE_MAGNITUDE};
      const RETENTION_DAYS = ${RETENTION_DAYS};
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
            backup: ${NO_BACKUP ? "false" : "true"},
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
    const res = await cleanup(conn, { dryRun: DRY_RUN, batchSize: BATCH_SIZE, backup: !NO_BACKUP });
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
  console.log(`📅 最舊 event_time: ${res.oldestEventTime}`);
  console.log(`🔎 M${MIN_WRITE_MAGNITUDE} 以下 (含無規模): ${res.subThreshold.toLocaleString()}`);
  console.log(`🔎 超過 ${RETENTION_DAYS} 天: ${res.stale.toLocaleString()}`);
  console.log(`🗑️ 符合刪除條件 (任一項成立即刪除): ${res.toDelete.toLocaleString()}`);
  if (res.dryRun) {
    console.log(`\nℹ️ [DRY-RUN] 若確認無誤，請加上 --execute 執行正式刪除。`);
    return;
  }
  console.log(`\n🗑️ 實際已刪除: ${res.deleted.toLocaleString()}`);
  console.log(`📉 刪除後總列數: ${res.after.toLocaleString()}`);
  if (res.backupTable) {
    console.log(`📦 完整備份表: ${res.backupTable}`);
  } else {
    console.log(`⚠️ 未建立備份表 (--no-backup)`);
  }
  console.log(`\n🎉 清理完成！`);
}

main();
