#!/usr/bin/env node
/**
 * Backfills missing coordinates for facilities in production DB using
 * Taiwan open-data geospatial datasets (preschools, hospitals/clinics, pharmacies).
 *
 * Usage:
 *   node --env-file=.env scripts/backfill-facilities-from-opendata-geo.mjs [kindergarten|clinic|pharmacy|all]
 */
import { normalizeAddress, toHalfwidthDigits, parseCsv } from "./lib/mohw-csv.mjs";

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const CHUNK_SIZE = 500;

if (!ADMIN_SECRET) {
  console.error("❌ Missing ADMIN_SECRET or RSS_SYNC_ADMIN_SECRET env var.");
  process.exit(1);
}

const targetScope = process.argv[2] || "all";

function normalizeMatchKey(str) {
  return (str || "")
    .replace(/[\s\(\)（）\[\]【】]/g, "")
    .replace(/[臺台]/g, "台")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .trim();
}

async function submitChunk(records, label, chunkIdx, totalChunks) {
  console.log(`  [${label}] Submitting chunk ${chunkIdx + 1}/${totalChunks} (${records.length} records)...`);
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

async function uploadBatches(records, label) {
  const totalChunks = Math.ceil(records.length / CHUNK_SIZE);
  let totalInserted = 0;
  let totalUpdated = 0;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const chunkIdx = Math.floor(i / CHUNK_SIZE);
    try {
      const result = await submitChunk(chunk, label, chunkIdx, totalChunks);
      totalInserted += result.inserted || 0;
      totalUpdated += result.updated || 0;
    } catch (err) {
      console.error(`  ❌ [${label}] Chunk ${chunkIdx + 1} failed: ${err.message}`);
    }
  }
  console.log(`  ✅ [${label}] Done! Uploaded ${records.length} records (Inserted: ${totalInserted}, Updated: ${totalUpdated})\n`);
  return { totalInserted, totalUpdated };
}

// 1. Backfill Kindergartens (moe_kindergarten)
async function backfillKindergartens() {
  console.log("=================================================");
  console.log("🏫 [Kindergarten] 載入開放資料幼兒園空間資料 (preschools.json)...");
  console.log("=================================================");
  const geoRes = await fetch("https://kiang.github.io/ap.ece.moe.edu.tw/preschools.json");
  if (!geoRes.ok) throw new Error(`Failed to load preschools.json: HTTP ${geoRes.status}`);
  const geoData = await geoRes.json();

  const titleMap = new Map();
  const addrMap = new Map();

  for (const f of geoData.features) {
    if (f.geometry && f.geometry.coordinates) {
      const p = f.properties;
      const coords = { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      const titleKey = normalizeMatchKey(p.title);
      if (titleKey) titleMap.set(titleKey, coords);
      const addrKey = normalizeMatchKey((p.city || "") + (p.town || "") + (p.address || ""));
      if (addrKey) addrMap.set(addrKey, coords);
    }
  }
  console.log(`  空間索引建立完成: ${titleMap.size} 個幼兒園名稱, ${addrMap.size} 個地址。`);

  console.log("  下載教育部最新全國幼兒園名冊 (k1_new.json)...");
  const res = await fetch("https://stats.moe.gov.tw/files/opendata/k1_new.json", {
    headers: { "User-Agent": "j172-health-sync/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download kindergarten dataset`);

  const list = await res.json();
  const allYears = Array.from(new Set(list.map((i) => String(i["學年度"] || "")))).filter(Boolean);
  allYears.sort((a, b) => Number(a) - Number(b));
  const latestYear = allYears[allYears.length - 1];
  const latestItems = list.filter((i) => String(i["學年度"]) === latestYear && i["學校名稱"] && i["地址"]);
  console.log(`  當期 (${latestYear}學年) 幼兒園筆數: ${latestItems.length} 筆。進行坐標配對...`);

  let matched = 0;
  const records = [];

  for (const r of latestItems) {
    const name = (r["學校名稱"] || "").trim();
    const rawAddr = (r["地址"] || "").replace(/^\[\d+\]/, "").trim();
    const city = (r["縣市名稱"] || "").replace(/^\[\d+\]/, "").trim();
    const district = (r["鄉鎮市區名稱"] || "").trim();
    const schoolCode = (r["代碼"] || "").trim();
    const ownership = (r["公/私立"] || "").trim();

    const rawAddress = city && !rawAddr.startsWith(city) ? `${city}${rawAddr}` : rawAddr;
    const address = normalizeAddress(rawAddress);
    const phone = r["電話"] || null;

    const titleKey = normalizeMatchKey(name);
    const addrKey = normalizeMatchKey(rawAddress);

    let coords = titleMap.get(titleKey) || addrMap.get(addrKey);
    if (coords) matched++;

    records.push({
      facilityType: "kindergarten",
      sourceKey: "moe_kindergarten",
      sourceId: `k_${schoolCode}_${name}_${address}`.slice(0, 100),
      name,
      address,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
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
    });
  }

  console.log(`  配對結果: ${matched} / ${records.length} (${(matched / records.length * 100).toFixed(1)}%) 具備精確坐標。`);

  const recordsWithCoords = records.filter((r) => r.lat != null && r.lng != null);
  console.log(`  準備將 ${recordsWithCoords.length} 筆具備坐標之幼兒園資料寫入生產資料庫...`);
  await uploadBatches(recordsWithCoords, "Kindergartens");
}

// 2. Backfill Hospitals & Clinics (nhi_hospital)
async function backfillHospitals() {
  console.log("=================================================");
  console.log("🏥 [Hospitals & Clinics] 載入開放資料醫事機構空間資料 (hospitals.json)...");
  console.log("=================================================");
  const geoRes = await fetch("https://raw.githubusercontent.com/kiang/info.nhi.gov.tw/master/docs/geojson/hospitals.json");
  if (!geoRes.ok) throw new Error(`Failed to load hospitals.json: HTTP ${geoRes.status}`);
  const geoData = await geoRes.json();

  const codeMap = new Map();
  const nameAddrMap = new Map();

  for (const f of geoData.features) {
    if (f.geometry && f.geometry.coordinates) {
      const p = f.properties;
      const coords = { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      if (p.id) codeMap.set(p.id.trim(), coords);
      const nameKey = normalizeMatchKey(p.name);
      const addrKey = normalizeMatchKey(p.address);
      if (nameKey && addrKey) nameAddrMap.set(`${nameKey}|${addrKey}`, coords);
    }
  }
  console.log(`  空間索引建立完成: ${codeMap.size} 個醫事機構代碼。`);

  const TIERS = [
    { rId: "A21030000I-D21001-003", tier: "醫學中心" },
    { rId: "A21030000I-D21002-005", tier: "區域醫院" },
    { rId: "A21030000I-D21003-003", tier: "地區醫院" },
    { rId: "A21030000I-D21004-009", tier: "基層診所" },
  ];

  let totalMatched = 0;
  const recordsWithCoords = [];

  for (const { rId, tier } of TIERS) {
    console.log(`  抓取健保特約名冊: ${tier} (${rId})...`);
    const res = await fetch(`https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=${rId}`);
    if (!res.ok) {
      console.error(`  ❌ 抓取 ${tier} 失敗: HTTP ${res.status}`);
      continue;
    }
    const text = await res.text();
    const rows = parseCsv(text);
    console.log(`    取得 ${rows.length} 筆資料，進行坐標配對...`);

    let tierMatched = 0;
    for (const row of rows) {
      const code = (row["醫事機構代碼"] || "").trim();
      const name = (row["醫事機構名稱"] || "").trim();
      if (!code || !name) continue;

      const rawAddr = row["地址"] || "";
      const address = normalizeAddress(rawAddr);

      let coords = codeMap.get(code);
      if (!coords) {
        const key = `${normalizeMatchKey(name)}|${normalizeMatchKey(address)}`;
        coords = nameAddrMap.get(key);
      }

      if (coords) {
        tierMatched++;
        recordsWithCoords.push({
          facilityType: "clinic",
          sourceKey: "nhi_hospital",
          sourceId: code,
          name,
          address,
          phone: row["電話"] ? toHalfwidthDigits(row["電話"]) : null,
          lat: coords.lat,
          lng: coords.lng,
          serviceItem: tier,
          serviceTime: row["診療科別"] || null,
          dataOrg: "衛福部中央健康保險署",
        });
      }
    }
    console.log(`    ${tier} 配對成功: ${tierMatched} / ${rows.length} (${(tierMatched / rows.length * 100).toFixed(1)}%)`);
    totalMatched += tierMatched;
  }

  console.log(`  醫療機構總配對成功筆數: ${recordsWithCoords.length} 筆。準備分批寫入生產資料庫...`);
  await uploadBatches(recordsWithCoords, "Hospitals & Clinics");
}

// 3. Backfill Pharmacies (nhi_pharmacy)
async function backfillPharmacies() {
  console.log("=================================================");
  console.log("💊 [Pharmacies] 載入開放資料藥局空間資料 (pharmacies/points.json)...");
  console.log("=================================================");
  const geoRes = await fetch("https://raw.githubusercontent.com/kiang/pharmacies/master/json/points.json");
  if (!geoRes.ok) throw new Error(`Failed to load pharmacies points.json: HTTP ${geoRes.status}`);
  const geoData = await geoRes.json();

  const codeMap = new Map();
  const nameAddrMap = new Map();

  for (const f of geoData.features) {
    if (f.geometry && f.geometry.coordinates) {
      const p = f.properties;
      const coords = { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      if (p.id) codeMap.set(p.id.trim(), coords);
      const nameKey = normalizeMatchKey(p.name);
      const addrKey = normalizeMatchKey(p.address);
      if (nameKey && addrKey) nameAddrMap.set(`${nameKey}|${addrKey}`, coords);
    }
  }
  console.log(`  空間索引建立完成: ${codeMap.size} 個特約藥局坐標。`);

  console.log("  抓取健保特約藥局名冊 (A21030000I-D21005-001)...");
  const res = await fetch("https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-D21005-001");
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch NHI pharmacy dataset`);

  const text = await res.text();
  const rows = parseCsv(text);
  console.log(`  取得 ${rows.length} 筆特約藥局資料，進行坐標配對...`);

  const recordsWithCoords = [];
  for (const row of rows) {
    const code = (row["醫事機構代碼"] || "").trim();
    const name = (row["醫事機構名稱"] || "").trim();
    if (!code || !name) continue;

    const rawAddr = row["地址"] || "";
    const address = normalizeAddress(rawAddr);

    let coords = codeMap.get(code);
    if (!coords) {
      const key = `${normalizeMatchKey(name)}|${normalizeMatchKey(address)}`;
      coords = nameAddrMap.get(key);
    }

    if (coords) {
      recordsWithCoords.push({
        facilityType: "pharmacy",
        sourceKey: "nhi_pharmacy",
        sourceId: code,
        name,
        address,
        phone: row["電話"] ? toHalfwidthDigits(row["電話"]) : null,
        lat: coords.lat,
        lng: coords.lng,
        serviceItem: "健保特約藥局",
        serviceTime: row["固定看診時段"] || null,
        dataOrg: "衛福部中央健康保險署",
      });
    }
  }

  console.log(`  藥局配對成功筆數: ${recordsWithCoords.length} / ${rows.length} 筆。準備分批寫入生產資料庫...`);
  await uploadBatches(recordsWithCoords, "Pharmacies");
}

async function main() {
  console.log("🚀 [OpenData Geo Backfill] 開始執行台灣開放空間資料坐標補齊任務...");
  console.log(`🎯 目標環境: ${BASE_URL}`);
  console.log(`🎯 執行範圍: ${targetScope}\n`);

  const start = Date.now();

  if (targetScope === "all" || targetScope === "kindergarten") {
    await backfillKindergartens();
  }

  if (targetScope === "all" || targetScope === "clinic" || targetScope === "hospital") {
    await backfillHospitals();
  }

  if (targetScope === "all" || targetScope === "pharmacy") {
    await backfillPharmacies();
  }

  const durationSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log("=================================================");
  console.log(`🎉 坐標補齊任務全部完成！總耗時: ${durationSec} 秒`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("❌ 任務執行失敗:", err);
  process.exit(1);
});

