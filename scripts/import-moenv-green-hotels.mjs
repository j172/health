#!/usr/bin/env node
/**
 * Fetches MOENV's 環保標章旅館環境即時通地圖資料 (gp_p_43) open-data API
 * and pushes the records to production's /api/admin/facilities-import endpoint.
 *
 * Each record from gp_p_43 contains:
 * - name: 旅館名稱
 * - address: 地址
 * - phone: 聯絡電話
 * - latitude: 緯度
 * - longitude: 經度
 * - note: 級別（金級環保旅宿/旅館、銀級環保旅宿/旅館、銅級環保旅宿/旅館）
 * - county: 縣市
 * - town: 行政區
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_GP_API_KEY=<key> node scripts/import-moenv-green-hotels.mjs
 */
import { normalizeAddress, toHalfwidthDigits, submitFacilities } from "./lib/mohw-csv.mjs";

const API_URL = "https://data.moenv.gov.tw/api/v2/gp_p_43";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const MOENV_KEY = process.env.MOENV_GP_API_KEY || process.env.MOENV_AQI_API_KEY;
const POST_BATCH_SIZE = 1000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_KEY) {
  console.error("Missing MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) env var.");
  process.exit(1);
}

async function fetchAllRows() {
  console.log("Fetching MOENV green hotel directory (gp_p_43)...");
  const all = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(MOENV_KEY)}&limit=${pageSize}&offset=${offset}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${API_URL} failed: HTTP ${res.status} (offset=${offset})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`  ${all.length} raw rows fetched`);
  return all;
}

function toRecords(rows) {
  const seenKeys = new Set();
  const records = [];

  for (const r of rows) {
    const name = (r.name || "").trim();
    const address = (r.address || "").trim();
    if (!name && !address) continue;

    // Use serialnumber if non-empty, otherwise fallback to hash/slug of name+address
    const sourceId = (r.serialnumber || "").trim() || `${name}_${address}`;
    if (seenKeys.has(sourceId)) continue;
    seenKeys.add(sourceId);

    const phone = (r.phone || "").trim();
    const lat = r.latitude ? parseFloat(r.latitude) : null;
    const lng = r.longitude ? parseFloat(r.longitude) : null;
    const note = (r.note || "").trim() || null;

    records.push({
      facilityType: "green_hotel",
      sourceKey: "moenv_green_hotel",
      sourceId,
      name,
      address: address ? normalizeAddress(address) : null,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      serviceItem: note,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  console.log(`  ${records.length} unique green hotels prepared`);
  return records;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} green hotels in batches of ${POST_BATCH_SIZE}...`);
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

