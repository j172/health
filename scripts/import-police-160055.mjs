#!/usr/bin/env node
/**
 * scripts/import-police-160055.mjs
 *
 * ONE-TIME historical import for issue #567: 內政部警政署「假投資（博弈）
 * 網站」(data.gov.tw dataset 160055). The dataset's own metadata says it
 * stopped updating after 2025-12-31 — its scope was folded into the newer,
 * broader 176455 list — so there is no ongoing cadence to put on a cron
 * schedule. This script fetches the full CSV once and upserts it into the
 * same `fraud_domains` table #564/#567's other two sources write to (keyed
 * by (domain, source) = (normalized-host, 'police_160055')).
 *
 * This is NOT a cron job — run it by hand, once, after this PR deploys:
 *   node --env-file=.env scripts/import-police-160055.mjs            # dry-run (default)
 *   node --env-file=.env scripts/import-police-160055.mjs --execute  # actually write
 *
 * Direct-DB only (no admin-API path, same as scripts/backfill-news-topics.mjs)
 * — this needs real MYSQL_* env vars, i.e. run it on the production host
 * itself or against a tunnel to it. Local .env's MYSQL_PASSWORD is known to
 * be stale (see docs/domains memory), so run this over SSH on the host
 * where the app is actually deployed if the local connection fails.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch {}
}

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const DRY_RUN = !EXECUTE;

async function main() {
  console.log("==================================================================");
  console.log("  160055 假投資（博弈）網站 一次性歷史匯入 (issue #567)");
  console.log("==================================================================");
  console.log(`模式: ${DRY_RUN ? "🔍 [DRY-RUN] 僅預覽統計，不寫入任何資料" : "⚡ [EXECUTE] 正式寫入 fraud_domains"}\n`);

  const { fetchPolice160055FraudDomains, POLICE_160055_SOURCE_KEY } = await import(
    "../lib/server/antiFraud/sources/police160055.ts"
  );

  console.log("下載中...");
  const records = await fetchPolice160055FraudDomains();
  console.log(`✅ 下載並解析完成：${records.length.toLocaleString()} 筆有效網域（來源：${POLICE_160055_SOURCE_KEY}）\n`);

  if (records.length === 0) {
    console.log("⚠️  0 筆資料，不執行寫入。");
    return;
  }

  console.log("範例（前 3 筆）：");
  for (const r of records.slice(0, 3)) {
    console.log(`  - ${r.domain}｜${r.fraudDescription ?? "(無說明)"}｜${r.reportedYearMonth ?? "(無日期)"}`);
  }
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ️  [DRY-RUN] 若確認無誤，請加上 --execute 正式寫入 fraud_domains。");
    return;
  }

  const { upsertFraudDomains } = await import("../lib/server/antiFraud/queries.ts");
  const { inserted, updated } = await upsertFraudDomains(records);
  console.log(`🎉 匯入完成：新增 ${inserted.toLocaleString()} 筆，更新 ${updated.toLocaleString()} 筆。`);
}

main().catch((err) => {
  console.error("❌ 執行過程發生錯誤:", err);
  process.exit(1);
});
