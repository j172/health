#!/usr/bin/env node
/**
 * Fetches Ministry of Education (MOE) Kindergarten Directory (k1_new.json),
 * filters for the latest active academic year, normalizes fields, merges in
 * kiang/ap.ece.moe.edu.tw's `preschools.json` (issue #602 — a MIT-licensed
 * community mirror of 全國教保資訊網 carrying the 非營利/準公共 split, monthly
 * fee, and penalty-record flag that MOE's own k1_new.json doesn't have), and
 * pushes the merged records to production's /api/admin/facilities-import
 * endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-moe-kindergartens.mjs
 */
import { toHalfwidthDigits, normalizeAddress } from "./lib/mohw-csv.mjs";
import { mergeKindergartenSources } from "./lib/kindergarten-merge.mjs";

const SOURCE_URL = "https://stats.moe.gov.tw/files/opendata/k1_new.json";
const KIANG_SOURCE_URL = "https://kiang.github.io/ap.ece.moe.edu.tw/preschools.json";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

/**
 * Fetches kiang's preschools.json. Returns `{ records: [], fetchedAt: null }`
 * on any failure (network error, non-2xx, bad JSON shape) rather than
 * throwing — this supplementary source enriching MOE's own data must never
 * take down the whole import if kiang.github.io happens to be unreachable.
 * `fetchedAt` is derived from the response's `Last-Modified` header (falling
 * back to "now" if that header is missing) so that mergeKindergartenSources's
 * 60-day staleness guard tracks when kiang's *data* was last actually
 * updated, not merely when this script last happened to run successfully.
 */
async function fetchKiangPreschools() {
  try {
    const res = await fetch(KIANG_SOURCE_URL, { headers: { "User-Agent": "j172-health-sync/1.0" } });
    if (!res.ok) {
      console.warn(`⚠️  kiang preschools.json 下載失敗（HTTP ${res.status}），本次僅使用教育部公/私立二分類資料。`);
      return { records: [], fetchedAt: null };
    }
    const lastModified = res.headers.get("last-modified");
    const fetchedAt = lastModified && !Number.isNaN(new Date(lastModified).getTime()) ? new Date(lastModified) : new Date();
    const geojson = await res.json();
    const records = Array.isArray(geojson?.features) ? geojson.features.map((feature) => feature.properties) : [];
    console.log(`kiang preschools.json 下載完成：${records.length} 筆（Last-Modified: ${fetchedAt.toISOString()}）。`);
    return { records, fetchedAt };
  } catch (err) {
    console.warn(`⚠️  kiang preschools.json 下載發生例外（${err.message}），本次僅使用教育部公/私立二分類資料。`);
    return { records: [], fetchedAt: null };
  }
}

async function submitChunk(records, chunkIndex, totalChunks) {
  console.log(`Submitting chunk ${chunkIndex + 1}/${totalChunks} (${records.length} records)...`);
  const res = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rss-sync-admin-secret": ADMIN_SECRET,
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log("=================================================");
  console.log("🏫 [Kindergartens] 開始下載教育部全國幼兒園名錄 (k1_new.json)...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log(`🎯 目標伺服器: ${BASE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "j172-health-sync/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download kindergarten dataset`);

  const list = await res.json();
  console.log(`總計取得 ${list.length} 筆歷史與當前年度幼兒園紀錄。`);

  // Find latest academic year
  const allYears = Array.from(new Set(list.map((i) => String(i["學年度"] || "")))).filter(Boolean);
  allYears.sort((a, b) => Number(a) - Number(b));
  const latestYear = allYears[allYears.length - 1];
  console.log(`最新學年度為: ${latestYear} 學年度，進行當期幼兒園資料篩選...`);

  const latestItems = list.filter((i) => String(i["學年度"]) === latestYear);
  console.log(`當期幼兒園筆數: ${latestItems.length} 筆。開始清洗資料...`);

  const records = latestItems
    .filter((r) => r["學校名稱"] && r["地址"])
    .map((r) => {
      const name = (r["學校名稱"] || "").trim();
      const rawAddr = (r["地址"] || "").replace(/^\[\d+\]/, "").trim();
      const city = (r["縣市名稱"] || "").replace(/^\[\d+\]/, "").trim();
      const district = (r["鄉鎮市區名稱"] || "").trim();
      const schoolCode = (r["代碼"] || "").trim();
      const ownership = (r["公/私立"] || "").trim();

      const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${rawAddr}` : rawAddr;
      const address = normalizeAddress(rawAddress);
      const phone = r["電話"] || null;

      return {
        facilityType: "kindergarten",
        sourceKey: "moe_kindergarten",
        sourceId: `k_${schoolCode}_${name}_${address}`.slice(0, 100),
        name,
        address,
        phone: phone ? toHalfwidthDigits(phone) : null,
        lat: null,
        lng: null,
        serviceItem: ownership ? `${ownership}幼兒園` : "幼兒園",
        serviceTime: `學年度：${r["學年度"] || latestYear}`,
        dataOrg: "教育部統計處",
        extra: {
          schoolCode,
          ownership,
          city,
          district,
          year: r["學年度"] || latestYear,
        },
      };
    });

  console.log(`有效幼兒園資料: ${records.length} 筆。開始下載 kiang/ap.ece.moe.edu.tw 補充資料...`);
  console.log(`🎯 來源: ${KIANG_SOURCE_URL}`);

  const { records: kiangRecords, fetchedAt: kiangFetchedAt } = await fetchKiangPreschools();
  const mergedRecords = mergeKindergartenSources(records, kiangRecords, kiangFetchedAt);
  const matchedCount = mergedRecords.filter((r) => r.extra?.category).length;
  console.log(`已補上非營利／準公共分類、月費、裁罰紀錄的幼兒園: ${matchedCount} / ${mergedRecords.length} 筆。`);

  console.log(`開始分批匯入資料庫...`);

  const CHUNK_SIZE = 500;
  const totalChunks = Math.ceil(mergedRecords.length / CHUNK_SIZE);
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < mergedRecords.length; i += CHUNK_SIZE) {
    const chunk = mergedRecords.slice(i, i + CHUNK_SIZE);
    const chunkIdx = Math.floor(i / CHUNK_SIZE);
    try {
      const result = await submitChunk(chunk, chunkIdx, totalChunks);
      totalInserted += result.inserted || 0;
      totalUpdated += result.updated || 0;
    } catch (err) {
      console.error(`❌ Chunk ${chunkIdx + 1} 匯入失敗: ${err.message}`);
    }
  }

  console.log("\n=================================================");
  console.log("🎉 全國幼兒園名錄資料匯入完成！");
  console.log(`📊 總筆數: ${mergedRecords.length} | 新增: ${totalInserted} | 更新: ${totalUpdated} | 已補充分類: ${matchedCount}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
