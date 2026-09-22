#!/usr/bin/env node
/**
 * scripts/cleanup-aqi-pm25-duplicates.mjs
 *
 * One-time cleanup for aqi_readings and pm25_readings: same bug as
 * cwa_station_weather (issue #378) and cwa_rainfall (issue #381) — the
 * UNIQUE KEY includes recorded_at, so every sync with a genuinely new
 * recorded_at INSERTs a new row instead of overwriting the old one.
 * Confirmed on production 2026-09-22: aqi_readings 93,744 rows / 84 sites,
 * pm25_readings 102,760 rows / 80 sites. See
 * docs/specs/aqi-pm25-narrow-unique-key-migration.md.
 *
 * Keeps only the newest recorded_at row per site (site_id for aqi_readings,
 * site_name for pm25_readings) and deletes the rest, in small batches. No
 * backup table by default (matching the cwa_rainfall cleanup's default —
 * pass --backup to opt in).
 *
 * Usage:
 *   node scripts/cleanup-aqi-pm25-duplicates.mjs                # dry-run (default)
 *   node scripts/cleanup-aqi-pm25-duplicates.mjs --execute      # actually delete, no backup
 *   node scripts/cleanup-aqi-pm25-duplicates.mjs --execute --batch-size=2000
 *   node scripts/cleanup-aqi-pm25-duplicates.mjs --execute --backup
 *   node scripts/cleanup-aqi-pm25-duplicates.mjs --remote       # force SSH path
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
const BACKUP = args.includes("--backup");
const FORCE_REMOTE = args.includes("--remote");

const TARGETS = [
  { table: "aqi_readings", groupCol: "site_id" },
  { table: "pm25_readings", groupCol: "site_name" },
];

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

async function cleanupOne(conn, { table, groupCol, dryRun, batchSize, backup }) {
  const [[{ before_count: before }]] = await conn.query(`SELECT COUNT(*) AS before_count FROM ${table}`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const backupTable = `${table}_backup_${stamp}`;
  let backedUp = false;

  await conn.query("DROP TEMPORARY TABLE IF EXISTS keep_latest");
  await conn.query(`
    CREATE TEMPORARY TABLE keep_latest AS
    SELECT ${groupCol} AS grp, MAX(recorded_at) AS max_recorded_at
    FROM ${table}
    GROUP BY ${groupCol}
  `);
  await conn.query("DROP TEMPORARY TABLE IF EXISTS keep_ids");
  await conn.query(`
    CREATE TEMPORARY TABLE keep_ids AS
    SELECT t.id FROM ${table} t
    JOIN keep_latest l
      ON t.${groupCol} = l.grp
     AND t.recorded_at = l.max_recorded_at
  `);
  await conn.query("ALTER TABLE keep_ids ADD PRIMARY KEY (id)");

  const [[{ keep }]] = await conn.query("SELECT COUNT(*) AS keep FROM keep_ids");
  const toDelete = before - keep;

  if (dryRun) {
    return { table, dryRun: true, before, keep, toDelete, backupTable: null, deleted: 0 };
  }

  if (backup) {
    await conn.query(`DROP TABLE IF EXISTS \`${backupTable}\``);
    await conn.query(`CREATE TABLE \`${backupTable}\` AS SELECT * FROM ${table}`);
    backedUp = true;
  }

  let deleted = 0;
  for (;;) {
    const [result] = await conn.query(
      `DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM keep_ids) LIMIT ${Number(batchSize)}`
    );
    deleted += result.affectedRows;
    if (result.affectedRows === 0) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  await conn.query(`OPTIMIZE TABLE ${table}`);
  const [[{ after_count: after }]] = await conn.query(`SELECT COUNT(*) AS after_count FROM ${table}`);

  return { table, dryRun: false, before, keep, toDelete, deleted, after, backupTable: backedUp ? backupTable : null };
}

async function cleanup(conn, opts) {
  const results = [];
  for (const target of TARGETS) {
    results.push(await cleanupOne(conn, { ...target, ...opts }));
  }
  return results;
}

async function main() {
  console.log("==================================================================");
  console.log("  aqi_readings / pm25_readings 重複列清理工具");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽，不刪除任何資料" : "⚡ [EXECUTE] 正式刪除重複列"}`);
  console.log(`批次大小: ${BATCH_SIZE}`);
  if (!DRY_RUN) console.log(`備份: ${BACKUP ? "✅ 刪除前會先建立完整備份表 (--backup)" : "❌ 未建立備份表 (預設行為)"}`);

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
      const TARGETS = ${JSON.stringify(TARGETS)};
      ${cleanupOne.toString()}
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

function report(results) {
  for (const res of results) {
    console.log(`\n=== ${res.table} ===`);
    console.log(`📊 目前總列數: ${res.before.toLocaleString()}`);
    console.log(`✅ 每站最新一筆將保留: ${res.keep.toLocaleString()}`);
    console.log(`🗑️ 判定為重複、可刪除: ${res.toDelete.toLocaleString()}`);
    if (res.dryRun) {
      console.log(`ℹ️ [DRY-RUN] 若確認無誤，請加上 --execute 執行正式刪除。`);
      continue;
    }
    console.log(`🗑️ 實際已刪除: ${res.deleted.toLocaleString()}`);
    console.log(`📉 刪除後總列數: ${res.after.toLocaleString()}`);
    console.log(res.backupTable ? `📦 完整備份表: ${res.backupTable}` : `⚠️ 未建立備份表`);
  }
  console.log(`\n🎉 清理完成！`);
}

main();
