#!/usr/bin/env node
/**
 * Fetches MOENV's 綠色商店基本資料 (gp_p_01) open-data API — a JSON
 * endpoint, not a CSV export, so this doesn't reuse scripts/lib/mohw-csv.mjs's
 * parseCsv, only its normalizeAddress/submitFacilities helpers — and pushes
 * the deduped records to production's /api/admin/facilities-import endpoint.
 *
 * Why this runs as a standalone script rather than an in-app source wired
 * into lib/server/facilities/runSync.ts (like the NHI/TFDA/hakka sources,
 * whose hosts are all reachable from production): the dataset is much
 * larger than gp_p_01's own `limit` parameter exposes per request (50k+
 * rows spread across ~50 pages of `limit=1000`, confirmed by paginating
 * with `offset` during spec verification) and only needs a refresh every
 * few months, same cadence as the MOHW import-*.mjs scripts — better run
 * under direct observation than as a silent background sync.
 *
 * `classtype` was investigated against the full pulled dataset (not just
 * the 5-record sample from spec-writing time): two values exist, "1"
 * (~99.7%, ~50k rows) and "2" (~0.3%, 161 rows across 64 stores). No
 * official data dictionary was found for gp_p_01 (dataset detail page has
 * no attached field-value doc; the linked greenliving.moenv.gov.tw lookup
 * site itself now redirects to a generic "coming soon"-style landing page).
 * The "2" rows are also suspicious as a genuine category: their `flagno`
 * values are non-numeric strings that look like battery/product brand
 * names (e.g. "金頂鹼性", "Panasoni") rather than the certification-mark
 * numbers `flagno` holds for every "1" row, suggesting either a distinct
 * sub-schema (e.g. battery take-back registration bleeding into this
 * endpoint) or a data-quality artifact — not a clean, user-facing
 * "store type" filter. Per spec §1's escape hatch, no `categories` filter
 * was added; `serviceItem` is left null. Flagged as an open question for
 * the account owner in case they have access to an internal data
 * dictionary that clarifies "2".
 *
 * No `deletemark`-style soft-delete field exists in this dataset (unlike
 * mnews_p_01) — every row for a given `storeno` is treated as a live
 * listing; duplicate rows per `storeno` (recurring re-certifications over
 * the years — up to several per store) are deduped by keeping the first
 * one seen, which — since the API is fetched sorted `ImportDate desc` — is
 * the most recent.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_GP_API_KEY=<key> node scripts/import-moenv-green-shops.mjs
 */
import { normalizeAddress, toHalfwidthDigits, submitFacilities } from "./lib/mohw-csv.mjs";

const API_URL = "https://data.moenv.gov.tw/api/v2/gp_p_01";
const PAGE_SIZE = 1000;
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MOENV_GP_API_KEY = process.env.MOENV_GP_API_KEY;
const POST_BATCH_SIZE = 3000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_GP_API_KEY) {
  console.error("Missing MOENV_GP_API_KEY env var.");
  process.exit(1);
}

async function fetchAllRows() {
  console.log("Fetching MOENV green shop directory (gp_p_01)...");
  const all = [];
  let offset = 0;
  let page = 0;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(MOENV_GP_API_KEY)}&limit=${PAGE_SIZE}&offset=${offset}&sort=ImportDate%20desc&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${API_URL} failed: HTTP ${res.status} (offset=${offset})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    page++;
    console.log(`  page ${page} (offset=${offset}): ${rows.length} rows`);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`  ${all.length} raw rows across ${page} pages`);
  return all;
}

function toRecords(rows) {
  const seenStoreno = new Set();
  const records = [];

  for (const r of rows) {
    const storeno = (r.storeno || "").trim();
    const storename = (r.storename || "").trim();
    const storeaddr = (r.storeaddr || "").trim();
    if (!storeno || !storename || !storeaddr) continue;
    if (seenStoreno.has(storeno)) continue; // keep first-seen == most recent (ImportDate desc)
    seenStoreno.add(storeno);

    const contacttel = (r.contacttel || "").trim();

    records.push({
      facilityType: "green_shop",
      sourceKey: "moenv_green_shop",
      sourceId: storeno,
      name: storename,
      address: normalizeAddress(storeaddr),
      phone: contacttel ? toHalfwidthDigits(contacttel) : null,
      lat: null,
      lng: null,
      serviceItem: null, // see header comment — classtype isn't a clean user-facing category
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  console.log(`  ${records.length} unique stores after dedupe (from ${rows.length} raw rows)`);
  return records;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} green shops in batches of ${POST_BATCH_SIZE}...`);
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
