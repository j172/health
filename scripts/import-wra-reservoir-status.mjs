#!/usr/bin/env node
/**
 * Fetches WRA's (經濟部水利署) 水庫即時營運狀況 open-data API and pushes the
 * records to production's /api/admin/wra-reservoir-status-sync endpoint.
 *
 * Unlike every MOENV import script in this repo, this source needs no API
 * key — confirmed live 2026-09-08 (issue #135).
 *
 * Each record contains:
 * - reservoiridentifier: 水庫代碼
 * - observationtime: 觀測時間
 * - waterlevel: 水位 (m)
 * - effectivewaterstoragecapacity: 有效蓄水量 (萬立方公尺)
 * - inflowdischarge / totaloutflow / spillwayoutflow / poweroutletoutflow /
 *   drainagetunneloutflow / desiltingtunneloutflow / othersoutflow / waterdraw:
 *   各類進出流量 (CMS)
 * - accumulaterainfallincatchment: 集水區累積降雨量 (mm)
 * - predeterminedcrossflow / predeterminedoutflowtime: 預排洪相關資訊
 * - statustype: 水庫營運狀態代碼
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-wra-reservoir-status.mjs
 */

const API_URL = "https://opendata.wra.gov.tw/api/v2/2be9044c-6e44-4856-aad5-dd108c2e6679";
// Confirmed live: this dataset holds today's hourly readings per reservoir
// (rolls over daily), not an indefinitely-growing archive — a single
// generously-limited request covers every reservoir with no offset loop needed.
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
  console.log("Fetching WRA 水庫即時營運狀況...");
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
    const reservoirId = String(r.reservoiridentifier ?? "").trim();
    const observationTime = toMysqlDatetime(r.observationtime);
    if (!reservoirId || !observationTime) continue;

    records.push({
      reservoirId,
      observationTime,
      waterLevel: parseNum(r.waterlevel),
      effectiveCapacity: parseNum(r.effectivewaterstoragecapacity),
      inflowDischarge: parseNum(r.inflowdischarge),
      totalOutflow: parseNum(r.totaloutflow),
      spillwayOutflow: parseNum(r.spillwayoutflow),
      powerOutletOutflow: parseNum(r.poweroutletoutflow),
      drainageTunnelOutflow: parseNum(r.drainagetunneloutflow),
      desiltingTunnelOutflow: parseNum(r.desiltingtunneloutflow),
      othersOutflow: parseNum(r.othersoutflow),
      waterDraw: parseNum(r.waterdraw),
      accumulateRainfall: parseNum(r.accumulaterainfallincatchment),
      predeterminedCrossFlow: parseNum(r.predeterminedcrossflow),
      predeterminedOutflowTime: r.predeterminedoutflowtime
        ? String(r.predeterminedoutflowtime).trim() || null
        : null,
      statusType: r.statustype ? String(r.statustype).trim() || null : null,
    });
  }
  console.log(`  ${records.length} usable records (from ${rows.length} raw rows)`);
  return records;
}

async function submitRecords(baseUrl, adminSecret, records) {
  const res = await fetch(`${baseUrl}/api/admin/wra-reservoir-status-sync`, {
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

  console.log(`Importing ${records.length} reservoir status readings in batches of ${POST_BATCH_SIZE}...`);
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
