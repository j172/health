#!/usr/bin/env node
/**
 * Fetches Ministry of Finance (FIA) Tax Deductible Entities & Non-Profit Institutions (BGMOPEN99.csv)
 * Assigns county administrative center coordinates, normalizes fields,
 * and pushes the records to production's /api/admin/facilities-import endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-fia-tax-organizations.mjs
 */
import { parseCsv } from "./lib/mohw-csv.mjs";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const SOURCE_URL = "https://eip.fia.gov.tw/data/BGMOPEN99.csv";
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

const COUNTY_COORDINATES = {
  "臺北市": [25.0375, 121.5637],
  "台北市": [25.0375, 121.5637],
  "新北市": [25.0124, 121.4657],
  "基隆市": [25.1276, 121.7392],
  "桃園市": [24.9936, 121.3010],
  "新竹市": [24.8138, 120.9675],
  "新竹縣": [24.8387, 121.0178],
  "苗栗縣": [24.5602, 120.8214],
  "臺中市": [24.1632, 120.6403],
  "台中市": [24.1632, 120.6403],
  "彰化縣": [24.0518, 120.5161],
  "南投縣": [23.9099, 120.6845],
  "雲林縣": [23.7092, 120.4313],
  "嘉義市": [23.4800, 120.4491],
  "嘉義縣": [23.4518, 120.2555],
  "臺南市": [22.9997, 120.1911],
  "台南市": [22.9997, 120.1911],
  "高雄市": [22.6273, 120.3014],
  "屏東縣": [22.6761, 120.4885],
  "宜蘭縣": [24.7570, 121.7530],
  "花蓮縣": [23.9872, 121.6016],
  "臺東縣": [22.7583, 121.1444],
  "台東縣": [22.7583, 121.1444],
  "澎湖縣": [23.5712, 119.5793],
  "金門縣": [24.4491, 118.3766],
  "連江縣": [26.1558, 119.9519],
};

function getCountyCenter(countyName) {
  if (!countyName) return [23.97565, 120.97388]; // Taiwan geographic center fallback
  for (const [key, coords] of Object.entries(COUNTY_COORDINATES)) {
    if (countyName.includes(key)) return coords;
  }
  return [23.97565, 120.97388];
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
  console.log("🏢 [Tax Organizations] 下載財政部扣繳單位名冊 (BGMOPEN99.csv)...");
  console.log(`🎯 來源: ${SOURCE_URL}`);
  console.log(`🎯 目標伺服器: ${BASE_URL}`);
  console.log("=================================================\n");

  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "j172-health-sync/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download BGMOPEN99`);

  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`原始下載 ${rows.length} 筆資料，進行格式清洗與縣市中心座標標註...`);

  const validRows = rows.filter((r) => {
    const ban = (r["統一編號"] || "").trim();
    return /^\d{8}$/.test(ban) && (r["單位名稱"] || "").trim().length > 0;
  });

  console.log(`有效機關團體扣繳單位: ${validRows.length} 筆。`);

  const records = validRows.map((r) => {
    const ban = r["統一編號"].trim();
    const name = r["單位名稱"].trim();
    const city = (r["機關所在縣市"] || "").trim();
    const reason = (r["原因說明文字"] || "").trim();
    const changeDate = (r["最近異動日期"] || "").trim();
    const [lat, lng] = getCountyCenter(city);

    return {
      facilityType: "tax_organization",
      sourceKey: "fia_tax_org",
      sourceId: `tax_${ban}`,
      name,
      address: city || "中華民國",
      phone: null,
      lat,
      lng,
      serviceItem: `統編：${ban}${reason ? ` | ${reason}` : ""}`,
      serviceTime: changeDate ? `最近異動：${changeDate}` : null,
      dataOrg: "財政部財政資訊中心",
      extra: {
        ban,
        city,
        changeDate,
        reason,
      },
    };
  });

  const CHUNK_SIZE = 1000;
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
  let totalInserted = 0;
  let totalUpdated = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
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
  console.log("🎉 財政部扣繳單位資料匯入完成！");
  console.log(`📊 總筆數: ${records.length} | 新增: ${totalInserted} | 更新: ${totalUpdated}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
