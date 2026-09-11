#!/usr/bin/env node
/**
 * Fetches Ministry of Economic Affairs (IDA) Certified Tourism Factories CSV:
 * https://www.ida.gov.tw/opendata/02/SDD6848.csv
 * Normalizes fields, and pushes records to /api/admin/facilities-import or DB.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret> node scripts/import-ida-tourism-factories.mjs
 */
import { parseCsv, normalizeAddress, toHalfwidthDigits, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL = "https://www.ida.gov.tw/opendata/02/SDD6848.csv";
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

async function main() {
  console.log("=================================================");
  console.log("🏭 [Tourism Factories] 下載產發署全台認證觀光工廠 (SDD6848.csv)...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download tourism factories dataset`);

  const csvText = await res.text();
  const list = parseCsv(csvText);
  console.log(`總計取得 ${list.length} 筆觀光工廠資料，開始清洗欄位...`);

  const records = [];
  for (const row of list) {
    const name = (row["觀光工廠名稱"] || "").trim();
    if (!name) continue;

    const address = normalizeAddress(row["地址"] || "");
    const rawPhone = (row["觀光工廠預約電話"] || "").trim();
    const phone = toHalfwidthDigits(rawPhone).replace(/[\r\n]+/g, " ");
    const website = (row["網址"] || "").trim() || null;
    const region = (row["地區別"] || "").trim();
    const city = (row["縣市"] || "").trim();
    const seq = (row["序號"] || "").trim() || name;

    records.push({
      facilityType: "tourism_factory",
      sourceKey: "ida_tourism_factory",
      sourceId: String(seq),
      name,
      address: address || null,
      phone: phone || null,
      lat: null,
      lng: null,
      serviceItem: region ? `${region}｜觀光工廠` : "觀光工廠",
      serviceTime: null,
      dataOrg: "經濟部產業發展署",
      extra: {
        website,
        region: region || null,
        city: city || null,
      },
    });
  }

  console.log(`有效觀光工廠筆數: ${records.length} 筆。`);

  if (ADMIN_SECRET) {
    console.log(`正在透過 API 提交至 ${BASE_URL}...`);
    const CHUNK_SIZE = 500;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const result = await submitFacilities(BASE_URL, ADMIN_SECRET, chunk);
      console.log(`批次 [${i + 1} - ${i + chunk.length}] 匯入完成:`, result);
    }
  } else {
    // Direct DB import
    console.log("未指定 ADMIN_SECRET，嘗試直接呼叫資料庫 upsertFacilities...");
    const { upsertFacilities } = await import("../lib/server/facilities/queries.ts");
    const result = await upsertFacilities(records);
    console.log("資料庫匯入完成:", result);
  }
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
