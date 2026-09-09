#!/usr/bin/env node
/**
 * Fetches WRA's (經濟部水利署) 水庫代碼表 (dataset/139336) and
 * 河川水位測站站況 (dataset/22227) open-data APIs and pushes the records to
 * production's /api/admin/wra-catalog-sync endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-wra-catalogs.mjs
 */

const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

async function main() {
  console.log(`Triggering WRA catalog sync at ${BASE_URL}/api/admin/wra-catalog-sync...`);
  const res = await fetch(`${BASE_URL}/api/admin/wra-catalog-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Sync failed: ${JSON.stringify(json)}`);
  }

  console.log("Sync succeeded! Results:");
  for (const r of json.results || []) {
    console.log(`  - ${r.sourceKey}: fetched=${r.fetched}, inserted=${r.inserted}, updated=${r.updated}, error=${r.error ?? "none"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
