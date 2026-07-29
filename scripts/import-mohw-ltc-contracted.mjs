#!/usr/bin/env node
/**
 * Fetches MOHW's 長照特約服務機構 (long-term-care CONTRACTED service
 * institution) registry — a much larger, richer dataset than the existing
 * mohw_ltc_full source (32k+ rows / 15k+ institutions vs 4k), one row per
 * (institution × contracted service item), and already carries lat/lng so
 * no geocoding backfill is needed for it — and pushes the deduped,
 * aggregated records to production's /api/admin/facilities-import endpoint.
 *
 * Why this runs locally instead of as part of the deployed app: same reason
 * as scripts/import-mohw-facilities.mjs — ltcpap.mohw.gov.tw is unreachable
 * from both the production host and GitHub Actions runners (IP-range
 * block), but reachable fine from a regular residential/office network.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-mohw-ltc-contracted.mjs
 */

const SOURCE_URL = "https://ltcpap.mohw.gov.tw/publish/abc.csv";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const POST_BATCH_SIZE = 3000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

/**
 * Full-text (not line-split-first) CSV parser — some MOHW exports embed
 * literal newlines inside quoted fields, which a split-on-newline-first
 * parser would corrupt into bogus extra rows.
 */
function parseCsv(text) {
  const cleaned = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip — \n ends the row
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];
  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

const toNum = (s) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

async function fetchRecords() {
  console.log("Fetching MOHW LTC contracted-service registry...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  downloaded ${buffer.length} bytes`);

  const rows = parseCsv(buffer.toString("utf-8"));
  console.log(`  ${rows.length} raw rows`);

  // One row per (institution × contracted service item) — dedupe by
  // 機構代碼, aggregating distinct service items into one facility record.
  const byCode = new Map();
  for (const r of rows) {
    const code = r["機構代碼"];
    if (!code || !r["機構名稱"]) continue;

    const lng = toNum(r["經度"]);
    const lat = toNum(r["緯度"]);
    const existing = byCode.get(code);
    const serviceItem = r["特約服務項目"];

    if (existing) {
      if (serviceItem && !existing.serviceItems.has(serviceItem)) existing.serviceItems.add(serviceItem);
      continue;
    }

    byCode.set(code, {
      name: r["機構名稱"],
      address: r["地址全址"] || null,
      phone: r["機構電話"] || null,
      lat: lat && lng ? lat : null,
      lng: lat && lng ? lng : null,
      serviceItems: new Set(serviceItem ? [serviceItem] : []),
      openBeds: r["開放床數"] || null,
      currentResidents: r["現有住民"] || null,
    });
  }

  console.log(`  ${byCode.size} unique institutions after dedupe`);

  return Array.from(byCode.entries()).map(([code, r]) => ({
    facilityType: "ltc_contracted",
    sourceKey: "mohw_ltc_contracted",
    sourceId: code,
    name: r.name,
    address: r.address,
    phone: r.phone,
    lat: r.lat,
    lng: r.lng,
    serviceItem: r.serviceItems.size > 0 ? Array.from(r.serviceItems).join("、") : null,
    serviceTime: null,
    dataOrg: "衛福部長照特約服務機構",
    extra: { openBeds: r.openBeds, currentResidents: r.currentResidents },
  }));
}

async function submitBatch(records) {
  const res = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rss-sync-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(`Import batch failed: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const records = await fetchRecords();
  console.log(`Importing ${records.length} institutions in batches of ${POST_BATCH_SIZE}...`);

  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitBatch(batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    console.log(`  batch ${i / POST_BATCH_SIZE + 1}: inserted=${result.inserted} updated=${result.updated}`);
  }

  console.log(`Done. Total inserted=${totalInserted} updated=${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
