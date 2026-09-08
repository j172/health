#!/usr/bin/env node
/**
 * Fetches WRA's (經濟部水利署) 水位站監測 open-data API and pushes the records to
 * production's /api/admin/wra-water-level-sync endpoint.
 *
 * Unlike every MOENV import script in this repo, this source needs no API
 * key — confirmed live 2026-09-08 (issue #135).
 *
 * Each record contains:
 * - stationid: 測站代碼
 * - observatoryidentifier: 觀測站識別碼
 * - checkresult / checkdesc: 資料品質檢核結果與說明
 * - volt: 電壓 (V)
 * - datetime: 觀測時間
 * - waterlevel: 水位 (m)
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-wra-water-level.mjs
 */

const API_URL = "https://opendata.wra.gov.tw/api/v2/73c4c3de-4045-4765-abeb-89f9f9cd5ff0";
// Confirmed live: this dataset is a "current status" snapshot (one row per
// station), not a growing archive — a single generously-limited request
// covers every station with no offset loop needed.
const FETCH_LIMIT = 5000;
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const POST_BATCH_SIZE = 2000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

const parseNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

const toMysqlDatetime = (raw) => {
  const s = String(raw ?? "").trim().replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

async function fetchAllRows() {
  console.log("Fetching WRA 水位站監測...");
  const url = `${API_URL}?sort=${encodeURIComponent("_importdate asc")}&format=JSON&limit=${FETCH_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${API_URL} failed: HTTP ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json.records ?? []);
  console.log(`  ${rows.length} raw rows`);
  return rows;
}

function toRecords(rows) {
  const records = [];
  for (const r of rows) {
    const stationId = String(r.stationid ?? "").trim();
    const recordedAt = toMysqlDatetime(r.datetime);
    if (!stationId || !recordedAt) continue;

    records.push({
      stationId,
      observatoryIdentifier: r.observatoryidentifier ? String(r.observatoryidentifier).trim() : null,
      checkResult: r.checkresult ? String(r.checkresult).trim() : null,
      checkDesc: r.checkdesc ? String(r.checkdesc).trim() : null,
      volt: parseNum(r.volt),
      waterLevel: parseNum(r.waterlevel),
      recordedAt,
    });
  }
  console.log(`  ${records.length} usable records (from ${rows.length} raw rows)`);
  return records;
}

async function submitRecords(baseUrl, adminSecret, records) {
  const res = await fetch(`${baseUrl}/api/admin/wra-water-level-sync`, {
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

  console.log(`Importing ${records.length} water level readings in batches of ${POST_BATCH_SIZE}...`);
  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += POST_BATCH_SIZE) {
    const batch = records.slice(i, i + POST_BATCH_SIZE);
    const result = await submitRecords(BASE_URL, ADMIN_SECRET, batch);
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
