#!/usr/bin/env node
/**
 * Standalone CDC Alerts Sync Script
 *
 * Syncs Taiwan CDC travel health alerts and international epidemic news.
 * Triggers the /api/admin/cdc-sync endpoint on production (or APP_BASE_URL)
 * using ADMIN_SECRET / RSS_SYNC_ADMIN_SECRET and bundled baseline CSV datasets.
 *
 * Usage:
 *   node scripts/sync-cdc-alerts.mjs
 */

import fs from "node:fs";
import path from "node:path";

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
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
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

const BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.HEALTH_BASE_URL ||
  "https://health.j172.tw";

const ADMIN_SECRET =
  process.env.ADMIN_SECRET ||
  process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("❌ Error: Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET in environment or .env file.");
  process.exit(1);
}

async function main() {
  const syncUrl = `${BASE_URL.replace(/\/+$/, "")}/api/admin/cdc-sync`;
  console.log(`[CDC Sync] Preparing sync payload for ${syncUrl}...`);

  const payload = {};
  const travelAlertFile = path.join(process.cwd(), "data", "cdc-travel-alert.csv");
  const intlEpidFile = path.join(process.cwd(), "data", "cdc-intl-epid.csv");

  if (fs.existsSync(travelAlertFile)) {
    payload.travelAlertCsv = fs.readFileSync(travelAlertFile, "utf-8");
    console.log(`  Loaded baseline travel alerts CSV: ${payload.travelAlertCsv.length} bytes`);
  }
  if (fs.existsSync(intlEpidFile)) {
    payload.intlEpidCsv = fs.readFileSync(intlEpidFile, "utf-8");
    console.log(`  Loaded baseline epidemic news CSV: ${payload.intlEpidCsv.length} bytes`);
  }

  console.log(`[CDC Sync] Sending POST request to ${syncUrl}...`);
  const startTime = Date.now();

  const res = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - startTime;

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ [CDC Sync] Failed (HTTP ${res.status}, ${durationMs}ms): ${errorText}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log(`✅ [CDC Sync] Success (${durationMs}ms):`, JSON.stringify(json, null, 2));

  // Verify by fetching public endpoint
  const verifyUrl = `${BASE_URL.replace(/\/+$/, "")}/api/cdc/travel-alerts`;
  console.log(`[CDC Sync] Verifying via ${verifyUrl}...`);
  try {
    const verifyRes = await fetch(verifyUrl);
    if (verifyRes.ok) {
      const verifyJson = await verifyRes.json();
      const alertCount = verifyJson.alerts?.length ?? 0;
      const newsCount = verifyJson.epidemicNews?.length ?? verifyJson.news?.length ?? 0;
      console.log(`✅ [CDC Sync Verification] Live travel alerts: ${alertCount}, epidemic news: ${newsCount}`);
      if (verifyJson.stats) {
        console.log(
          `   Stats: Level 3 (Warning)=${verifyJson.stats.level3Count}, Level 2 (Alert)=${verifyJson.stats.level2Count}, Level 1 (Watch)=${verifyJson.stats.level1Count}, Total Countries=${verifyJson.stats.totalCountries}`
        );
      }
    } else {
      console.warn(`⚠️ [CDC Sync Verification] Public endpoint returned HTTP ${verifyRes.status}`);
    }
  } catch (verifyErr) {
    console.warn(`⚠️ [CDC Sync Verification] Failed to verify public endpoint:`, verifyErr.message);
  }
}

if (
  !process.argv[1] ||
  process.argv[1].endsWith("sync-cdc-alerts.mjs") ||
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))
) {
  main().catch((err) => {
    console.error("❌ [CDC Sync] Fatal error:", err);
    process.exit(1);
  });
}
