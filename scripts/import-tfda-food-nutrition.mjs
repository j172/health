#!/usr/bin/env node
/**
 * Fetches TFDA's food nutrition composition database (data.fda.gov.tw
 * InfoId=20, a ZIP-wrapped JSON export) and pushes the parsed records to the
 * production /api/admin/food-nutrition-import endpoint in batches.
 *
 * Why this runs on GitHub Actions instead of the production host: the
 * archive unpacks to 226k+ records, which is too much to unzip/JSON.parse
 * on this host's low ulimit -v (the same WASM-OOM constraint documented in
 * lib/server/net/httpClient.ts) — GitHub's runners have plenty of headroom,
 * so fetch/unzip/parse happens here and only the already-parsed records are
 * POSTed to production, batched to keep each request comfortably under the
 * import endpoint's 60s maxDuration.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-tfda-food-nutrition.mjs
 */
import AdmZip from "adm-zip";

const SOURCE_URL = "https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=5";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const POST_BATCH_SIZE = 3000;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET env var (the x-rss-sync-admin-secret value).");
  process.exit(1);
}

const nullify = (s) => (s && String(s).trim() ? String(s).trim() : null);

async function fetchRecords() {
  console.log("Fetching TFDA food nutrition ZIP...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`  downloaded ${buffer.length} bytes`);

  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith(".json"));
  if (!entry) throw new Error("TFDA food nutrition ZIP contained no .json entry");

  const raw = JSON.parse(entry.getData().toString("utf-8"));
  console.log(`  ${raw.length} raw records`);

  return raw
    .filter((r) => r["整合編號"] && r["分析項分類"] && r["分析項"])
    .map((r) => ({
      sampleId: r["整合編號"],
      foodCategory: nullify(r["食品分類"]),
      dataCategory: nullify(r["資料類別"]),
      sampleName: nullify(r["樣品名稱"]),
      commonName: nullify(r["俗名"]),
      sampleNameEn: nullify(r["樣品英文名稱"]),
      contentDescription: nullify(r["內容物描述"]),
      wasteRate: nullify(r["廢棄率"]),
      nutrientCategory: r["分析項分類"],
      nutrientItem: r["分析項"],
      unit: nullify(r["含量單位"]),
      valuePer100g: nullify(r["每100克含量"]),
      sampleCount: nullify(r["樣本數"]),
      stdDev: nullify(r["標準差"]),
      valuePerUnit: nullify(r["每單位含量"]),
      unitWeight: nullify(r["每單位重"]),
      valuePerUnitWeight: nullify(r["每單位重含量"]),
    }));
}

async function submitBatch(records) {
  const res = await fetch(`${BASE_URL}/api/admin/food-nutrition-import`, {
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
  console.log(`Importing ${records.length} records in batches of ${POST_BATCH_SIZE}...`);

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
