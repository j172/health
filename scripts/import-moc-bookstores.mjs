#!/usr/bin/env node
/**
 * Fetches Ministry of Culture (MOC) bookstores open data:
 * https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=M
 * Normalizes fields, and pushes records to /api/admin/facilities-import or DB.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret> node scripts/import-moc-bookstores.mjs
 */
import { normalizeAddress, toHalfwidthDigits, submitFacilities } from "./lib/mohw-csv.mjs";

const SOURCE_URL = "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=M";
const BASE_URL = (process.env.HEALTH_BASE_URL || "https://health.j172.tw").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

async function main() {
  console.log("=================================================");
  console.log("📚 [Bookstores] 下載文化部實體書店開放資料 (typeId=M)...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download bookstore dataset`);

  const list = await res.json();
  console.log(`總計取得 ${list.length} 筆書店資料，開始清洗欄位...`);

  const records = [];
  for (const item of list) {
    const name = (item.name || "").trim();
    if (!name) continue;

    const cityPrefix = (item.cityName || "").trim().replace(/\s+/g, "");
    const rawAddress = (item.address || "").trim();
    const fullAddress = rawAddress.startsWith(cityPrefix) ? rawAddress : `${cityPrefix}${rawAddress}`;
    const cleanAddress = normalizeAddress(fullAddress);

    const lat = item.latitude ? Number(item.latitude) : null;
    const lng = item.longitude ? Number(item.longitude) : null;

    records.push({
      facilityType: "bookstore",
      sourceKey: "moc_bookstore",
      sourceId: String(item.mainTypePk || name).trim(),
      name,
      address: cleanAddress || null,
      phone: toHalfwidthDigits(item.phone || "").trim() || null,
      lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
      lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
      serviceItem: item.openTime ? `營業時間：${item.openTime.trim()}` : "實體書店",
      serviceTime: item.openTime ? item.openTime.trim() : null,
      dataOrg: "文化部",
      extra: {
        openTime: item.openTime || null,
        website: item.website || null,
        email: item.email || null,
        intro: item.intro || null,
        arriveWay: item.arriveWay || null,
        facebook: item.facebook || null,
        name_eng: item.name_eng || null,
      },
    });
  }

  console.log(`有效書店筆數: ${records.length} 筆。`);

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
