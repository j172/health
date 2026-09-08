#!/usr/bin/env node
/**
 * Fetches all eight MOENV AQX_* open-data datasets (issue #131) and pushes
 * the records to production's /api/admin/aqx-sync endpoint, one dataset at
 * a time.
 *
 * Five "wide" hourly datasets — one row per site+item+date, 24 hourly value
 * columns (monitorvalue00..23):
 *   - aqx_p_15  空氣品質監測小時值(一般污染物,每日更新)
 *   - aqx_p_16  BTEX監測小時值(每日更新)
 *   - aqx_p_17  非甲烷碳氫化合物(NMHC)監測小時值
 *   - aqx_p_18  總碳氫化合物(THC)監測小時值
 *   - aqx_p_25  光化測站小時值資料
 *
 * Three "narrow" single-reading datasets — one row per reading:
 *   - aqx_p_318 CO_8hr平均值(每日提供17筆)
 *   - aqx_p_319 PM10小時值(每小時提供)
 *   - aqx_p_35  空氣品質監測小時值資料(其它測項,每小時更新)
 *
 * Same shape as scripts/import-moenv-green-products.mjs.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_AQI_API_KEY=<key> node scripts/import-moenv-aqx.mjs
 */

const BASE_API_URL = "https://data.moenv.gov.tw/api/v2";
const PAGE_SIZE = 1000;
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const MOENV_KEY = process.env.MOENV_AQI_API_KEY || process.env.MOENV_GP_API_KEY;
const POST_BATCH_SIZE = 2000;

const WIDE_DATASETS = ["aqx_p_15", "aqx_p_16", "aqx_p_17", "aqx_p_18", "aqx_p_25"];
const NARROW_DATASETS = ["aqx_p_318", "aqx_p_319", "aqx_p_35"];

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_KEY) {
  console.error("Missing MOENV_AQI_API_KEY (or MOENV_GP_API_KEY) env var.");
  process.exit(1);
}

const parseNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

const toMysqlDate = (raw) => {
  const s = String(raw ?? "").trim().replace(/\//g, "-");
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const toMysqlDatetime = (raw) => {
  let s = String(raw ?? "").trim().replace(/\//g, "-").replace("T", " ");
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s = `${s}:00`;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

async function fetchAllRows(datasetCode) {
  const all = [];
  let offset = 0;
  let page = 0;

  while (true) {
    const url = `${BASE_API_URL}/${datasetCode}?format=JSON&limit=${PAGE_SIZE}&offset=${offset}&api_key=${encodeURIComponent(MOENV_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${datasetCode} fetch failed: HTTP ${res.status} (offset=${offset})`);
    const json = await res.json();
    const rows = Array.isArray(json) ? json : (json.records ?? []);
    page++;
    console.log(`  ${datasetCode} page ${page} (offset=${offset}): ${rows.length} rows`);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

function toWideRecords(datasetCode, rows) {
  const records = [];
  for (const r of rows) {
    const siteId = String(r.siteid ?? "").trim();
    const itemId = String(r.itemid ?? "").trim();
    const monitorDate = toMysqlDate(r.monitordate);
    if (!siteId || !itemId || !monitorDate) continue;

    const hourlyValues = [];
    for (let h = 0; h < 24; h++) {
      hourlyValues.push(parseNum(r[`monitorvalue${String(h).padStart(2, "0")}`]));
    }

    records.push({
      datasetCode,
      siteId,
      siteName: String(r.sitename ?? "").trim(),
      itemId,
      itemName: String(r.itemname ?? "").trim(),
      itemEngName: r.itemengname ? String(r.itemengname).trim() : null,
      itemUnit: r.itemunit ? String(r.itemunit).trim() : null,
      monitorDate,
      hourlyValues,
    });
  }
  return records;
}

function toNarrowRecords(datasetCode, rows) {
  const records = [];
  for (const r of rows) {
    const siteId = String(r.siteid ?? "").trim();
    const itemId = String(r.itemid ?? "").trim();
    const monitorDate = toMysqlDatetime(r.monitordate);
    if (!siteId || !itemId || !monitorDate) continue;

    records.push({
      datasetCode,
      siteId,
      siteName: String(r.sitename ?? "").trim(),
      county: r.county ? String(r.county).trim() : null,
      itemId,
      itemName: String(r.itemname ?? "").trim(),
      itemEngName: r.itemengname ? String(r.itemengname).trim() : null,
      itemUnit: r.itemunit ? String(r.itemunit).trim() : null,
      monitorDate,
      concentration: parseNum(r.concentration),
    });
  }
  return records;
}

async function submitBatch(datasetCode, records) {
  const res = await fetch(`${BASE_URL}/api/admin/aqx-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ datasetCode, records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Import failed for ${datasetCode}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function importDataset(datasetCode, shape) {
  console.log(`Fetching MOENV ${datasetCode}...`);
  const rows = await fetchAllRows(datasetCode);
  const records = shape === "wide" ? toWideRecords(datasetCode, rows) : toNarrowRecords(datasetCode, rows);
  console.log(`  ${records.length} usable records (from ${rows.length} raw rows)`);

  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitBatch(datasetCode, batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    console.log(
      `  ${datasetCode} batch ${Math.floor(i / POST_BATCH_SIZE) + 1}: inserted=${result.inserted} updated=${result.updated}`,
    );
  }
  console.log(`Done ${datasetCode}. inserted=${totalInserted} updated=${totalUpdated}`);
}

async function main() {
  for (const datasetCode of WIDE_DATASETS) {
    await importDataset(datasetCode, "wide");
  }
  for (const datasetCode of NARROW_DATASETS) {
    await importDataset(datasetCode, "narrow");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
