/**
 * Imports 環境部全國公廁 (fac_p_07) into the facilities registry.
 *
 * Same shape as scripts/import-moenv-green-shops.mjs: page the MOENV open-data
 * endpoint, map to FacilityRecord, POST to /api/admin/facilities-import.
 *
 * Unlike the green-shop directory this dataset ships coordinates, so the rows
 * land already geocoded and never enter the OpenCage budget queue.
 *
 * One row per *toilet*, not per venue — a single building appears once for the
 * men's, once for the women's, once for the accessible one. They are kept as
 * separate rows because the accessibility attributes differ between them and
 * that is exactly what someone searching for 無障礙廁所 or 親子廁所 needs.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret> MOENV_API_KEY=<key> \
 *     node scripts/import-moenv-public-toilets.mjs
 */

import { normalizeAddress, submitFacilities } from "./lib/mohw-csv.mjs";

const API_URL = "https://data.moenv.gov.tw/api/v2/fac_p_07";
const PAGE_SIZE = 1000;
const POST_BATCH_SIZE = 3000;

const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
// data.moenv.gov.tw issues one key per account that works across every dataset,
// so any of the three names this project stores it under will do.
const API_KEY =
  process.env.MOENV_API_KEY ||
  process.env.MOENV_NEWS_API_KEY ||
  process.env.MOENV_GP_API_KEY ||
  process.env.MOENV_PM25_API_KEY;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!API_KEY) {
  console.error("Missing a MOENV API key (MOENV_API_KEY / MOENV_NEWS_API_KEY / MOENV_GP_API_KEY / MOENV_PM25_API_KEY).");
  process.exit(1);
}

const text = (value) => (value == null ? "" : String(value).trim());

const num = (value) => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

async function fetchAllRows() {
  console.log("Fetching MOENV public toilet registry (fac_p_07)...");
  const all = [];
  let offset = 0;
  let page = 0;

  for (;;) {
    const url = `${API_URL}?api_key=${encodeURIComponent(API_KEY)}&limit=${PAGE_SIZE}&offset=${offset}&sort=ImportDate%20desc&format=JSON`;
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

/**
 * The searchable attributes, joined into serviceItem.
 *
 * `type` already names the kind of toilet (無障礙廁所 / 親子廁所 / 性別友善廁所),
 * `grade` is MOENV's cleanliness rating, and `diaper` flags a changing table —
 * the three things that actually decide whether a given toilet is usable for the
 * person searching.
 */
const describe = (row) => {
  const parts = [
    text(row.type),
    text(row.grade),
    text(row.type2),
    text(row.diaper) === "1" ? "設有尿布台" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("｜") : null;
};

function toRecords(rows) {
  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const number = text(row.number);
    const name = text(row.name);
    const address = text(row.address);
    if (!number || !name || !address) continue;
    if (seen.has(number)) continue; // first-seen wins, and the feed is ImportDate desc
    seen.add(number);

    records.push({
      facilityType: "public_toilet",
      sourceKey: "moenv_public_toilet",
      sourceId: number,
      name,
      address: normalizeAddress(address),
      phone: null,
      lat: num(row.latitude),
      lng: num(row.longitude),
      serviceItem: describe(row),
      serviceTime: null,
      dataOrg: text(row.administration) || "環境部",
    });
  }

  const geocoded = records.filter((r) => r.lat !== null && r.lng !== null).length;
  console.log(`  ${records.length} unique toilets after dedupe (from ${rows.length} raw rows)`);
  console.log(`  ${geocoded} already carry coordinates (${records.length - geocoded} would need geocoding)`);
  return records;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} public toilets in batches of ${POST_BATCH_SIZE}...`);
  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitFacilities(BASE_URL, ADMIN_SECRET, batch);
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
