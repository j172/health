#!/usr/bin/env node
/**
 * Fetches Ministry of Education (MOE) Cram Schools from 22 Taiwan cities/counties
 * and pushes the merged parsed records to production's /api/admin/facilities-import endpoint.
 *
 * Usage:
 *   ADMIN_SECRET=<x-rss-sync-admin-secret value> node scripts/import-moe-cram-schools.mjs
 */
import { toHalfwidthDigits, normalizeAddress } from "./lib/mohw-csv.mjs";

const CITY_DEFINITIONS = [
  { id: 24, name: "基隆市" },
  { id: 20, name: "臺北市" },
  { id: 21, name: "新北市" },
  { id: 33, name: "桃園市" },
  { id: 35, name: "新竹市" },
  { id: 36, name: "新竹縣" },
  { id: 37, name: "苗栗縣" },
  { id: 42, name: "臺中市" },
  { id: 47, name: "彰化縣" },
  { id: 55, name: "雲林縣" },
  { id: 49, name: "南投縣" },
  { id: 52, name: "嘉義市" },
  { id: 53, name: "嘉義縣" },
  { id: 62, name: "臺南市" },
  { id: 70, name: "高雄市" },
  { id: 87, name: "屏東縣" },
  { id: 39, name: "宜蘭縣" },
  { id: 38, name: "花蓮縣" },
  { id: 89, name: "臺東縣" },
  { id: 69, name: "澎湖縣" },
  { id: 82, name: "金門縣" },
  { id: 83, name: "連江縣" },
];

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

async function fetchCityCramSchools(city) {
  const url = `https://bsb.kh.edu.tw/afterschool/opendata/afterschool_json.jsp?city=${city.id}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "j172-health-sync/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    return json.map((item) => ({ ...item, _cityName: city.name, _cityId: city.id }));
  } catch (err) {
    console.error(`⚠️ Failed to fetch cram schools for ${city.name} (${city.id}): ${err.message}`);
    return [];
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
  const json = await res.json();
  return json;
}

async function main() {
  console.log("=================================================");
  console.log("📚 [Cram Schools] 開始抓取全台 22 縣市短期補習班開放資料...");
  console.log(`🎯 目標伺服器: ${BASE_URL}`);
  console.log("=================================================\n");

  const allRaw = [];
  for (const city of CITY_DEFINITIONS) {
    process.stdout.write(`Fetching ${city.name}... `);
    const rows = await fetchCityCramSchools(city);
    console.log(`received ${rows.length} records`);
    allRaw.push(...rows);
  }

  console.log(`\n總計抓取 ${allRaw.length} 筆短期補習班原始資料，開始清洗格式...`);

  const records = allRaw
    .filter((r) => r["短期補習班名稱"] && r["地址"])
    .map((r) => {
      const name = (r["短期補習班名稱"] || "").trim();
      const rawAddr = (r["地址"] || "").trim();
      const city = (r["地區縣市"] || r._cityName || "").trim();
      const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${rawAddr}` : rawAddr;
      const address = normalizeAddress(rawAddress);
      const phone = r["電話"] || r["連絡電話"] || null;
      const category = r["短期補習班類別"] || null;

      return {
        facilityType: "cram_school",
        sourceKey: "moe_cram_school",
        sourceId: `cram_${r._cityId || ""}_${name}_${address}`.slice(0, 100),
        name,
        address,
        phone: phone ? toHalfwidthDigits(phone) : null,
        lat: null,
        lng: null,
        serviceItem: category,
        serviceTime: r["立案時間"] ? `立案日期：${r["立案時間"]}` : null,
        dataOrg: "教育部短期補習班資訊管理系統",
        extra: {
          approvedDate: r["立案時間"] || null,
          email: r["電子郵件"] || null,
          city: city || null,
          adminCode: r["主管機關文件單位代碼"] || null,
        },
      };
    });

  console.log(`有效補習班記錄: ${records.length} 筆，開始分批匯入資料庫...`);

  const CHUNK_SIZE = 500;
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
  console.log("🎉 全台短期補習班資料匯入完成！");
  console.log(`📊 總筆數: ${records.length} | 新增: ${totalInserted} | 更新: ${totalUpdated}`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("執行失敗:", err);
  process.exit(1);
});
