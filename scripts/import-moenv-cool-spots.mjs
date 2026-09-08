#!/usr/bin/env node
/**
 * Fetches MOENV's Cool Map 涼適點點位 (gis_p_82) open-data API and pushes the
 * records to production's /api/admin/facilities-import endpoint.
 *
 * Same shape as scripts/import-moenv-public-toilets.mjs: page the MOENV
 * open-data endpoint, map to FacilityRecord, POST to the admin import route.
 *
 * Each record from gis_p_82 contains:
 * - RecordID: 店代碼
 * - CoolingType: 店家種類
 * - StationType: 設施類型
 * - PlaceName: 名稱
 * - City / District: 縣市 / 鄉鎮
 * - Address: 地址
 * - Phone: 電話
 * - Longitude / Latitude: 經緯度
 * - OpeningHours: 營業時間
 * - AirConditioning / Restroom / Seats / WaterDispenser / IsOutdoor / IsAccessible: 設施旗標
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_GP_API_KEY=<key> node scripts/import-moenv-cool-spots.mjs
 */
import { normalizeAddress, toHalfwidthDigits, submitFacilities } from "./lib/mohw-csv.mjs";

const API_URL = "https://data.moenv.gov.tw/api/v2/gis_p_82";
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
// data.moenv.gov.tw issues one key per account that works across every dataset,
// so any of the names this project stores it under will do.
const MOENV_KEY =
  process.env.MOENV_GP_API_KEY ||
  process.env.MOENV_NEWS_API_KEY ||
  process.env.MOENV_AQI_API_KEY ||
  process.env.MOENV_PM25_API_KEY;
const PAGE_SIZE = 1000;
const POST_BATCH_SIZE = 1000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_KEY) {
  console.error("Missing a MOENV API key (MOENV_GP_API_KEY / MOENV_NEWS_API_KEY / MOENV_AQI_API_KEY / MOENV_PM25_API_KEY).");
  process.exit(1);
}

const text = (value) => (value == null ? "" : String(value).trim());

const num = (value) => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

const isTruthy = (value) => {
  const v = text(value).toLowerCase();
  return v === "1" || v === "y" || v === "yes" || v === "true" || v === "有" || v === "是";
};

async function fetchAllRows() {
  console.log("Fetching MOENV Cool Map 涼適點點位 (gis_p_82)...");
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

/** The amenity flags, joined into serviceItem so a searcher can tell at a glance what's on offer. */
// Field names below are lowercase, matching every other data.moenv.gov.tw v2
// dataset already wired into this codebase (gp_p_02, gp_p_43, epr_p_02,
// aqx_p_23, wr_s_04, ...) — a PascalCase guess used here previously
// (row.PlaceName / row.Address / ...) matched nothing in the live response,
// so every row got silently dropped, which is why cool_spot stayed at 0
// rows in production (see issue #156).
const describe = (row) => {
  const parts = [
    text(row.coolingtype),
    text(row.stationtype),
    isTruthy(row.airconditioning) ? "有冷氣" : "",
    isTruthy(row.restroom) ? "有廁所" : "",
    isTruthy(row.seats) ? "有座位" : "",
    isTruthy(row.waterdispenser) ? "有飲水機" : "",
    isTruthy(row.isaccessible) ? "無障礙設施" : "",
    isTruthy(row.isoutdoor) ? "戶外" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("｜") : null;
};

function toRecords(rows) {
  const seen = new Set();
  const records = [];

  for (const row of rows) {
    const name = text(row.placename);
    const address = text(row.address);
    if (!name && !address) continue;

    const recordId = text(row.recordid);
    const sourceId = recordId || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const phone = text(row.phone);
    const fullAddress = [text(row.city), text(row.district), address].filter(Boolean).join("");

    records.push({
      facilityType: "cool_spot",
      sourceKey: "moenv_cool_spot",
      sourceId,
      name,
      address: fullAddress ? normalizeAddress(fullAddress) : null,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: num(row.latitude),
      lng: num(row.longitude),
      serviceItem: describe(row),
      serviceTime: text(row.openinghours) || null,
      dataOrg: "環境部",
    });
  }

  console.log(`  ${records.length} unique cool spots after dedupe (from ${rows.length} raw rows)`);
  return records;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} cool spots in batches of ${POST_BATCH_SIZE}...`);
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
