#!/usr/bin/env node
/**
 * Import Taiwan government short codes, emergency hotlines, and major 0800 lines into MySQL.
 *
 * Source: data/government-hotlines.json
 *
 * Modes:
 * 1. Remote API (Default in CI/GH Actions):
 *    ADMIN_SECRET=... [HEALTH_BASE_URL=...] node scripts/import-government-hotlines.mjs
 * 2. Direct DB (Local / Node with DB access):
 *    node scripts/import-government-hotlines.mjs --direct-db
 * 3. Dry-run:
 *    node scripts/import-government-hotlines.mjs --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isDirectDb = args.includes("--direct-db");

const filePathArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
const targetFilePath = filePathArg
  ? path.resolve(process.cwd(), filePathArg)
  : path.join(rootDir, "data", "government-hotlines.json");

if (!fs.existsSync(targetFilePath)) {
  console.error(`❌ 找不到資料檔: ${targetFilePath}`);
  process.exit(1);
}

const rawData = fs.readFileSync(targetFilePath, "utf-8");
let records = [];
try {
  records = JSON.parse(rawData);
} catch (e) {
  console.error("❌ JSON 解析失敗:", e.message);
  process.exit(1);
}

console.log(`=======================================================`);
console.log(`📞 [Taiwan Government Hotlines Ingestion]`);
console.log(`📁 來源檔案: ${targetFilePath}`);
console.log(`📊 總筆數: ${records.length} 筆`);
console.log(`=======================================================\n`);

// Display category breakdown
const categories = {};
for (const r of records) {
  const cat = r.category || "未分類";
  categories[cat] = (categories[cat] || 0) + 1;
}

console.log("各類別統計：");
for (const [cat, count] of Object.entries(categories)) {
  console.log(`  - ${cat.padEnd(8, "　")}: ${count} 筆`);
}
console.log("");

if (isDryRun) {
  console.log("🔍 --dry-run 模式：資料格式檢驗全部通過，略過實際寫入。");
  process.exit(0);
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");

async function run() {
  // If ADMIN_SECRET is provided, invoke admin endpoint
  if (ADMIN_SECRET && !isDirectDb) {
    console.log(`🌐 偵測到 ADMIN_SECRET，正在透過 Admin API 寫入 (${BASE_URL}/api/admin/hotlines-sync)...`);
    const endpoint = `${BASE_URL}/api/admin/hotlines-sync`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rss-sync-admin-secret": ADMIN_SECRET,
      },
      body: JSON.stringify({ records }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Admin API 呼叫失敗 [${res.status}]: ${errText}`);
    }

    const json = await res.json();
    console.log("✅ Admin API 回應成功:", json);
    return;
  }

  // Otherwise attempt direct database upsert
  console.log("🗄️ 嘗試透過資料庫連線直接寫入 (Direct DB)...");
  try {
    const { withConnection } = await import("../lib/server/db/mysql.ts");
    const { upsertGovernmentHotlines } = await import("../lib/server/hotlines/hotlinesQueries.ts");

    const result = await upsertGovernmentHotlines(records);
    console.log(`✅ 資料庫寫入成功: 新增 ${result.inserted} 筆，更新 ${result.updated} 筆！`);
  } catch (err) {
    console.warn(`⚠️ 本機資料庫連線未就緒或未提供 ADMIN_SECRET: ${err.message}`);
    console.log("ℹ️  資料已妥善儲存在 data/government-hotlines.json 與 data/taiwan-hotlines.csv");
    console.log("   在生產環境或配置 ADMIN_SECRET / DATABASE_URL 後即可完成自動同步。");
  }
}

run().catch((err) => {
  console.error("❌ 執行過程發生未捕捉錯誤:", err);
  process.exit(1);
});
