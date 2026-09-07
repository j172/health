#!/usr/bin/env node
/**
 * Fetches MOENV's 應符合室內空氣品質法之公告場所 (aqx_p_23) open-data API and
 * pushes the records to production's /api/admin/facilities-import endpoint.
 *
 * Same shape as scripts/import-moenv-public-toilets.mjs: page the MOENV
 * open-data endpoint, map to FacilityRecord, POST to the admin import route.
 *
 * Unlike the public-toilet dataset these rows carry no coordinates — they
 * enter the shared address-geocode backfill (see lib/server/facilities/
 * geocodeBatch.ts's SOURCES_IN_PRIORITY, which this source is registered in)
 * like every other address-only facility source.
 *
 * Each record from aqx_p_23 contains:
 * - placeid: 場所代碼
 * - placename: 場所名稱
 * - zipcode: 郵遞區號
 * - address: 地址
 * - placetype: 場所類別
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_GP_API_KEY=<key> node scripts/import-moenv-iaq-premises.mjs
 */
import { normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const API_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_23";
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const MOENV_KEY =
  process.env.MOENV_GP_API_KEY ||
  process.env.MOENV_NEWS_API_KEY ||
  process.env.MOENV_AQI_API_KEY ||
  process.env.MOENV_PM25_API_KEY;
const PAGE_SIZE = 1000;
const POST_BATCH_SIZE = 2000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_KEY) {
  console.error("Missing a MOENV API key (MOENV_GP_API_KEY / MOENV_NEWS_API_KEY / MOENV_AQI_API_KEY / MOENV_PM25_API_KEY).");
  process.exit(1);
}

const text = (value) => (value == null ? "" : String(value).trim());

async function fetchAllRows() {
  console.log("Fetching MOENV 應符合室內空氣品質法之公告場所 (aqx_p_23)...");
  const all = [];
  let offset = 0;
  let page = 0;

  for (;;) {
    const url = `${API_URL}?api_key=${encodeURIComponent(MOENV_KEY)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${API_URL} failed: HTTP ${res.status} (offset=${offset})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.records ?? []);
    page += 1;
    console.log(`  page ${page} (offset=${offset}): ${rows.length} rows`);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`  ${all.length} raw rows across ${page} pages`);
  return all;
}

function toRecords(rows) {
  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const name = text(row.placename);
    const address = text(row.address);
    if (!name && !address) continue;

    const placeId = text(row.placeid);
    const sourceId = placeId || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const zipcode = text(row.zipcode);
    const fullAddress = zipcode && !address.startsWith(zipcode) ? `${zipcode}${address}` : address;

    records.push({
      facilityType: "iaq_premise",
      sourceKey: "moenv_iaq_premise",
      sourceId,
      name,
      address: fullAddress ? normalizeAddress(fullAddress) : null,
      phone: null,
      lat: null,
      lng: null,
      serviceItem: text(row.placetype) || null,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  console.log(`  ${records.length} unique premises after dedupe (from ${rows.length} raw rows)`);
  return records;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} premises in batches of ${POST_BATCH_SIZE}...`);
  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitFacilities(BASE_URL, ADMIN_SECRET, batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    console.log(`  batch ${Math.floor(i / POST_BATCH_SIZE) + 1}: inserted=${result.inserted} updated=${result.updated}`);
  }

  console.log(`Done. Total inserted=${totalInserted} updated=${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
