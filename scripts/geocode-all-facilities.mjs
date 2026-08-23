#!/usr/bin/env node
/**
 * Sequential geocoding backfill runner for all facility records missing lat/lng.
 * Resets geocode_attempts=0 upfront so previously failed items get retried,
 * then processes each source in strict priority order:
 *   1. Child Welfare (全国親子館 / 兒少服務中心)
 *   2. Care & Welfare (老人福利 / 身障福利 / 長照特約 / 長照機構 / 無障礙ATM / 客庄社區)
 *   3. Pharmacies & Health Checks (特約藥局 / 一般藥局 / 健檢機構 / 職業傷病 / 居家醫療)
 *   4. Clinics & Green Shops (基層診所與醫院 / 綠色商店)
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/geocode-all-facilities.mjs
 */

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

const SOURCES_IN_PRIORITY = [
  // Priority 1: 兒少福利與婦幼安全 (優先定位)
  { facilityType: "child_safety_spot", sourceKey: "npa_child_safety_spot", label: "婦幼安全警示地點" },
  { facilityType: "child_welfare_nursery", sourceKey: "mohw_child_welfare_nursery", label: "全國親子館" },
  { facilityType: "child_welfare_center", sourceKey: "mohw_child_welfare_center", label: "兒少福利中心" },
  { facilityType: "kindergarten", sourceKey: "moe_kindergarten", label: "全國幼兒園" },
  { facilityType: "cram_school", sourceKey: "moe_cram_school", label: "全國短期補習班" },

  // Priority 2: 長照與福利機構
  { facilityType: "elder_welfare", sourceKey: "mohw_elder_welfare", label: "老人福利機構" },
  { facilityType: "disability_welfare", sourceKey: "mohw_disability_welfare", label: "身障福利機構" },
  { facilityType: "ltc_contracted", sourceKey: "mohw_ltc_contracted", label: "長照特約機構" },
  { facilityType: "long_term_care", sourceKey: "mohw_ltc_full", label: "長照機構" },
  { facilityType: "disability_atm", sourceKey: "nfcc_accessible_atm", label: "無障礙ATM" },
  { facilityType: "hakka_community", sourceKey: "hakka_dtst20230600002", label: "客委會伯公照護站" },

  // Priority 3: 藥局與健檢機構
  { facilityType: "pharmacy", sourceKey: "nhi_pharmacy", label: "健保特約藥局" },
  { facilityType: "pharmacy", sourceKey: "tfda_pharmacy", label: "一般藥局" },
  { facilityType: "health_check", sourceKey: "mol_labor_checkup", label: "勞工健檢機構" },
  { facilityType: "health_check", sourceKey: "mol_occupational_injury", label: "職業傷病網絡醫院" },
  { facilityType: "health_check", sourceKey: "mohw_hpa_facility", label: "國健署促進機構" },
  { facilityType: "home_healthcare", sourceKey: "nhi_home_healthcare", label: "居家醫療機構" },

  // Priority 4: 診所與綠色商店 (筆數最多)
  { facilityType: "clinic", sourceKey: "nhi_hospital", label: "醫療院所與診所" },
  { facilityType: "green_shop", sourceKey: "moenv_green_shop", label: "綠色商店" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocodeBatch(facilityType, sourceKey, limit = 30) {
  const res = await fetch(`${BASE_URL}/api/admin/facilities-geocode`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ facilityType, sourceKey, limit }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.summary || { attempted: 0, geocoded: 0, failed: 0 };
}

async function resetGeocodeAttempts() {
  console.log("🔄 Resetting geocode_attempts = 0 for all missing coordinate records via endpoint...");
  const res = await fetch(`${BASE_URL}/api/admin/facilities-renormalize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
  });
  console.log("  Renormalize status:", res.status);
}

async function main() {
  console.log("=================================================");
  console.log("🗺️ [Geocoding] 開始執行機構地理座標全量補齊流程");
  console.log(`🎯 目標伺服器: ${BASE_URL}`);
  console.log("=================================================\n");

  let totalGeocoded = 0;
  let totalFailed = 0;
  let totalAttempted = 0;

  for (const { facilityType, sourceKey, label } of SOURCES_IN_PRIORITY) {
    console.log(`\n📍 [類別處理] ${label} (${facilityType} / ${sourceKey})`);
    let sourceGeocoded = 0;
    let sourceFailed = 0;
    let sourceAttempted = 0;

    while (true) {
      try {
        const summary = await geocodeBatch(facilityType, sourceKey, 30);
        if (!summary || summary.attempted === 0) {
          break;
        }

        sourceAttempted += summary.attempted;
        sourceGeocoded += summary.geocoded;
        sourceFailed += summary.failed;

        totalAttempted += summary.attempted;
        totalGeocoded += summary.geocoded;
        totalFailed += summary.failed;

        process.stdout.write(
          `  - 已處理 ${sourceAttempted} 筆 | 成功 ${sourceGeocoded} 筆 | 失敗 ${sourceFailed} 筆\r`
        );

        await sleep(100);
      } catch (err) {
        console.error(`  ⚠️ 批次處理發生錯誤: ${err.message}，5秒後重試...`);
        await sleep(5000);
      }
    }

    console.log(`  ✅ ${label} 處理完成：嘗試 ${sourceAttempted} 筆，成功 ${sourceGeocoded} 筆，失敗 ${sourceFailed} 筆。`);
  }

  console.log("\n=================================================");
  console.log("🎉 所有類別地理座標補齊流程完成！");
  console.log(`📊 總處理筆數: ${totalAttempted} 筆`);
  console.log(`✨ 成功定位: ${totalGeocoded} 筆`);
  console.log(`❌ 無法定位: ${totalFailed} 筆`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
