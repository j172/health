#!/usr/bin/env node
/**
 * Fetches MOENV's 碳足跡排放係數 (cfp_p_02) open-data API and pushes the
 * records to production's /api/admin/carbon-footprint-coefficients-sync
 * endpoint.
 *
 * Same shape as scripts/import-moenv-carbon-footprint-products.mjs.
 *
 * Each record contains:
 * - name: 係數名稱
 * - coe: 碳足跡數值 (kgCO2e)
 * - unit: 宣告單位
 * - departmentname: 政府部門/公司名稱（選擇性揭露）
 * - announcementyear: 公告年份
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> MOENV_GP_API_KEY=<key> node scripts/import-moenv-carbon-footprint-coefficients.mjs
 */

const API_URL = "https://data.moenv.gov.tw/api/v2/cfp_p_02";
const PAGE_SIZE = 1000;
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const MOENV_KEY = process.env.MOENV_GP_API_KEY || process.env.MOENV_AQI_API_KEY;
const POST_BATCH_SIZE = 2000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}
if (!MOENV_KEY) {
  console.error("Missing MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) env var.");
  process.exit(1);
}

async function fetchAllRows() {
  console.log("Fetching MOENV 碳足跡排放係數 (cfp_p_02)...");
  const all = [];
  let offset = 0;
  let page = 0;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(MOENV_KEY)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
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
  const seenKey = new Set();
  const records = [];

  for (const r of rows) {
    const coefficientName = (r.name || "").trim();
    if (!coefficientName) continue;

    const unit = (r.unit || "").trim() || null;
    const departmentName = (r.departmentname || "").trim();
    const announcementYear = (r.announcementyear || "").trim();
    const coeRaw = r.coe;
    const coefficientValue =
      coeRaw === null || coeRaw === undefined || coeRaw === "" ? null : parseFloat(coeRaw);

    // Mirrors the DB's composite unique key (coefficient_name, unit, department_name, announcement_year).
    const key = `${coefficientName}|${unit ?? ""}|${departmentName}|${announcementYear}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    records.push({
      coefficientName,
      coefficientValue: coefficientValue !== null && !isNaN(coefficientValue) ? coefficientValue : null,
      unit,
      departmentName,
      announcementYear,
    });
  }

  console.log(`  ${records.length} unique coefficients after deduplication (from ${rows.length} raw rows)`);
  return records;
}

async function submitCoefficients(baseUrl, adminSecret, records) {
  const res = await fetch(`${baseUrl}/api/admin/carbon-footprint-coefficients-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": adminSecret,
    },
    body: JSON.stringify({ records }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(`Import failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const rows = await fetchAllRows();
  const records = toRecords(rows);

  console.log(`Importing ${records.length} carbon footprint coefficients in batches of ${POST_BATCH_SIZE}...`);
  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitCoefficients(BASE_URL, ADMIN_SECRET, batch);
    totalInserted += result.inserted;
    totalUpdated += result.updated;
    console.log(
      `  batch ${Math.floor(i / POST_BATCH_SIZE) + 1}: inserted=${result.inserted} updated=${result.updated}`,
    );
  }

  console.log(`Done. Total inserted=${totalInserted} updated=${totalUpdated}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
