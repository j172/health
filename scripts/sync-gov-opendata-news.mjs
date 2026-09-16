#!/usr/bin/env node
/**
 * scripts/sync-gov-opendata-news.mjs
 *
 * Standalone CLI tool to fetch, parse, and synchronize Government Open Data
 * and Official Public News across MOHW, MOENV, MOA, MOI, MOTC, and local agencies.
 *
 * Implements dual-track ingestion as defined in docs/specs/gov-opendata-news-integration.md:
 *   - Recent news (<= 90 days): fetches full articles and assets
 *   - History news (> 90 days): directly ingests open data fields (when --backfill is on)
 *
 * Usage:
 *   node scripts/sync-gov-opendata-news.mjs --dry-run
 *   node scripts/sync-gov-opendata-news.mjs --dry-run --limit=5
 *   node scripts/sync-gov-opendata-news.mjs --source=mohw-focus --limit=10
 *   ADMIN_SECRET=<secret> node scripts/sync-gov-opendata-news.mjs [--backfill]
 */

import fs from "node:fs";
import path from "node:path";

// Load environment variables if .env files exist
function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

// Parse CLI Arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isBackfill = args.includes("--backfill");

let limit = 0;
const limitArg = args.find((a) => a.startsWith("--limit="));
if (limitArg) {
  limit = parseInt(limitArg.split("=")[1], 10) || 0;
}

let sourceFilter = null;
const sourceArg = args.find((a) => a.startsWith("--source="));
if (sourceArg) {
  sourceFilter = sourceArg.split("=")[1].trim();
}

const BASE_URL = process.env.APP_BASE_URL || process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

console.log("=================================================");
console.log("🏛️  [Gov Open Data News Sync] 政府開放資料新聞同步");
console.log("=================================================");
console.log(`模式: ${isDryRun ? "🔍 乾跑測試 (--dry-run)" : "⚡ 正式同步"}`);
console.log(`歷史回溯: ${isBackfill ? "啟用 (收錄 > 90 天公告)" : "停用 (僅近 90 天最新公告)"}`);
if (limit > 0) console.log(`每源限制: ${limit} 筆`);
if (sourceFilter) console.log(`來源過濾: ${sourceFilter}`);
console.log("");

// In dry-run or when testing locally, we can directly parse the feeds using fast-xml-parser
async function runCli() {
  const { GOV_OPENDATA_SOURCES } = await import("../lib/server/config/gov-opendata-news-sources.ts");
  
  const sources = sourceFilter
    ? GOV_OPENDATA_SOURCES.filter((s) => s.id === sourceFilter)
    : GOV_OPENDATA_SOURCES;

  if (sources.length === 0) {
    console.error(`❌ 找不到符合條件的來源: ${sourceFilter}`);
    process.exit(1);
  }

  console.log(`找到 ${sources.length} 個公部門資料來源，開始檢索...`);

  if (!isDryRun && ADMIN_SECRET) {
    // Production/API mode: Trigger admin endpoint
    const endpoint = `${BASE_URL.replace(/\/+$/, "")}/api/admin/gov-opendata-news-sync`;
    console.log(`[API 觸發] 呼叫遠端同步端點: ${endpoint}`);
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rss-sync-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({
          sourceId: sourceFilter || undefined,
          limit: limit || undefined,
          backfill: isBackfill,
          dryRun: false,
        }),
      });
      const data = await resp.json();
      console.log("遠端同步回應:", JSON.stringify(data, null, 2));
      return;
    } catch (err) {
      console.warn("呼叫遠端 API 失敗，切換為本地直連模式:", err.message);
    }
  }

  // Local/Direct parsing mode
  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    cdataPropName: "__cdata",
  });

  let totalItems = 0;
  let totalFresh = 0;

  for (const src of sources) {
    console.log(`\n📡 [${src.ministry} - ${src.agencyName}] 擷取 ${src.feedName} (${src.url})...`);
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "health.j172.tw-gov-news-cli/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`  ⚠️ HTTP ${res.status}: ${res.statusText}`);
        continue;
      }

      const xml = await res.text();
      const parsed = parser.parse(xml);
      const rawItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
      const items = Array.isArray(rawItems) ? rawItems : [rawItems];
      const targetItems = limit > 0 ? items.slice(0, limit) : items;

      console.log(`  ✅ 成功獲取 ${items.length} 則原始新聞 (處理前 ${targetItems.length} 則)`);

      for (const item of targetItems) {
        totalItems++;
        const title = (item.title?.__cdata || item.title || "").trim();
        const link = (item.link?.__cdata || item.link || item.guid || "").trim();
        const pubDate = item.pubDate || item.published || item["dc:date"] || "未知日期";
        
        // Simple age estimation
        const dateObj = new Date(pubDate);
        const isFreshEstimate = !isNaN(dateObj.getTime()) && (Date.now() - dateObj.getTime()) <= 90 * 86400000;
        if (isFreshEstimate) totalFresh++;

        console.log(`    - [${isFreshEstimate ? "近期" : "歷史"}] ${title.slice(0, 45)}... (${pubDate})`);
      }
    } catch (err) {
      console.error(`  ❌ 擷取失敗: ${err.message}`);
    }
  }

  console.log("\n=================================================");
  console.log(`🎉 檢索完成！總共檢視: ${totalItems} 筆新聞 (${totalFresh} 筆近期, ${totalItems - totalFresh} 筆歷史)`);
  if (isDryRun) {
    console.log("ℹ️ 乾跑模式完成，未向資料庫寫入任何資料。");
  }
}

runCli().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
