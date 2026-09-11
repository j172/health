#!/usr/bin/env node
/**
 * scripts/build-facility-seeds.mjs
 *
 * Downloads and normalizes open datasets to build static seed fallbacks:
 * 1. IDA Certified Tourism Factories (~178 records) -> data/facilities-seeds/tourism_factory.json
 * 2. MOC Physical Bookstores (~660 records) -> data/facilities-seeds/bookstore.json
 * 3. MOC Heritage Assets (~1064 points) -> data/heritage-map-seed.json
 *
 * Run:
 *   node scripts/build-facility-seeds.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv, normalizeAddress, toHalfwidthDigits } from "./lib/mohw-csv.mjs";

const ROOT_DIR = process.cwd();
const SEEDS_DIR = path.join(ROOT_DIR, "data", "facilities-seeds");
const HERITAGE_SEED_PATH = path.join(ROOT_DIR, "data", "heritage-map-seed.json");

if (!fs.existsSync(SEEDS_DIR)) {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

// 台灣縣市中心點經緯度
const COUNTY_COORDS = {
  台北市: { lat: 25.0375, lng: 121.5637 },
  臺北市: { lat: 25.0375, lng: 121.5637 },
  新北市: { lat: 25.0125, lng: 121.4658 },
  基隆市: { lat: 25.1322, lng: 121.7444 },
  桃園市: { lat: 24.9936, lng: 121.301 },
  新竹市: { lat: 24.8039, lng: 120.9647 },
  新竹縣: { lat: 24.8387, lng: 121.0177 },
  苗栗縣: { lat: 24.5601, lng: 120.8214 },
  台中市: { lat: 24.1627, lng: 120.6473 },
  臺中市: { lat: 24.1627, lng: 120.6473 },
  彰化縣: { lat: 24.0816, lng: 120.5385 },
  南投縣: { lat: 23.91, lng: 120.686 },
  雲林縣: { lat: 23.7093, lng: 120.4313 },
  嘉義市: { lat: 23.48, lng: 120.4491 },
  嘉義縣: { lat: 23.4518, lng: 120.2555 },
  台南市: { lat: 22.9997, lng: 120.227 },
  臺南市: { lat: 22.9997, lng: 120.227 },
  高雄市: { lat: 22.6273, lng: 120.3014 },
  屏東縣: { lat: 22.6826, lng: 120.4879 },
  宜蘭縣: { lat: 24.757, lng: 121.753 },
  花蓮縣: { lat: 23.9912, lng: 121.6196 },
  台東縣: { lat: 22.7583, lng: 121.1444 },
  臺東縣: { lat: 22.7583, lng: 121.1444 },
  澎湖縣: { lat: 23.5658, lng: 119.5793 },
  金門縣: { lat: 24.4327, lng: 118.3226 },
  連江縣: { lat: 26.1558, lng: 119.9519 },
};

// 主要鄉鎮市區中心點經緯度常用表
const DISTRICT_COORDS = {
  "基隆市安樂區": { lat: 25.132, lng: 121.713 },
  "基隆市七堵區": { lat: 25.096, lng: 121.714 },
  "新北市林口區": { lat: 25.077, lng: 121.391 },
  "新北市鶯歌區": { lat: 24.955, lng: 121.355 },
  "新北市八里區": { lat: 25.147, lng: 121.398 },
  "新北市三峽區": { lat: 24.934, lng: 121.37 },
  "新北市五股區": { lat: 25.083, lng: 121.438 },
  "新北市瑞芳區": { lat: 25.109, lng: 121.806 },
  "新北市土城區": { lat: 24.972, lng: 121.444 },
  "新北市淡水區": { lat: 25.176, lng: 121.444 },
  "新北市樹林區": { lat: 24.991, lng: 121.424 },
  "新北市板橋區": { lat: 25.011, lng: 121.463 },
  "新北市三重區": { lat: 25.061, lng: 121.499 },
  "新北市新店區": { lat: 24.968, lng: 121.542 },
  "新北市中和區": { lat: 25.001, lng: 121.5 },
  "台北市內湖區": { lat: 25.07, lng: 121.589 },
  "台北市大同區": { lat: 25.063, lng: 121.513 },
  "台北市中正區": { lat: 25.032, lng: 121.518 },
  "台北市萬華區": { lat: 25.029, lng: 121.5 },
  "台北市信義區": { lat: 25.034, lng: 121.565 },
  "台北市大安區": { lat: 25.026, lng: 121.544 },
  "台北市文山區": { lat: 24.989, lng: 121.575 },
  "桃園市龜山區": { lat: 24.993, lng: 121.338 },
  "桃園市楊梅區": { lat: 24.914, lng: 121.146 },
  "桃園市蘆竹區": { lat: 25.047, lng: 121.293 },
  "桃園市八德區": { lat: 24.929, lng: 121.283 },
  "桃園市大溪區": { lat: 24.883, lng: 121.287 },
  "桃園市龍潭區": { lat: 24.863, lng: 121.216 },
  "桃園市中壢區": { lat: 24.965, lng: 121.225 },
  "桃園市桃園區": { lat: 24.993, lng: 121.301 },
  "桃園市大園區": { lat: 25.064, lng: 121.197 },
  "桃園市新屋區": { lat: 24.972, lng: 121.106 },
  "新竹市香山區": { lat: 24.786, lng: 120.932 },
  "新竹縣竹北市": { lat: 24.839, lng: 121.018 },
  "新竹縣湖口鄉": { lat: 24.904, lng: 121.044 },
  "新竹縣新埔鎮": { lat: 24.829, lng: 121.073 },
  "新竹縣關西鎮": { lat: 24.795, lng: 121.176 },
  "新竹縣芎林鄉": { lat: 24.774, lng: 121.078 },
  "苗栗縣竹南鎮": { lat: 24.686, lng: 120.878 },
  "苗栗縣頭份市": { lat: 24.687, lng: 120.912 },
  "苗栗縣銅鑼鄉": { lat: 24.486, lng: 120.787 },
  "苗栗縣公館鄉": { lat: 24.499, lng: 120.825 },
  "苗栗縣苑裡鎮": { lat: 24.442, lng: 120.655 },
  "苗栗縣通霄鎮": { lat: 24.489, lng: 120.677 },
  "苗栗縣三義鄉": { lat: 24.382, lng: 120.762 },
  "苗栗縣西湖鄉": { lat: 24.542, lng: 120.749 },
  "台中市大雅區": { lat: 24.229, lng: 120.648 },
  "台中市神岡區": { lat: 24.258, lng: 120.662 },
  "台中市豐原區": { lat: 24.254, lng: 120.723 },
  "台中市霧峰區": { lat: 24.062, lng: 120.7 },
  "台中市大里區": { lat: 24.102, lng: 120.678 },
  "台中市烏日區": { lat: 24.108, lng: 120.624 },
  "台中市外埔區": { lat: 24.332, lng: 120.654 },
  "台中市大甲區": { lat: 24.348, lng: 120.622 },
  "台中市清水區": { lat: 24.269, lng: 120.569 },
  "台中市沙鹿區": { lat: 24.234, lng: 120.567 },
  "台中市西屯區": { lat: 24.181, lng: 120.617 },
  "台中市南區": { lat: 24.123, lng: 120.663 },
  "彰化縣鹿港鎮": { lat: 24.057, lng: 120.435 },
  "彰化縣線西鄉": { lat: 24.13, lng: 120.466 },
  "彰化縣和美鎮": { lat: 24.111, lng: 120.501 },
  "彰化縣社頭鄉": { lat: 23.896, lng: 120.586 },
  "彰化縣田中鎮": { lat: 23.859, lng: 120.584 },
  "彰化縣埤頭鄉": { lat: 23.892, lng: 120.463 },
  "彰化縣芳苑鄉": { lat: 23.926, lng: 120.322 },
  "彰化縣埔心鄉": { lat: 23.953, lng: 120.548 },
  "彰化縣福興鄉": { lat: 24.045, lng: 120.443 },
  "彰化縣田尾鄉": { lat: 23.892, lng: 120.526 },
  "彰化縣員林市": { lat: 23.959, lng: 120.574 },
  "彰化縣彰化市": { lat: 24.082, lng: 120.539 },
  "南投縣南投市": { lat: 23.91, lng: 120.686 },
  "南投縣草屯鎮": { lat: 23.978, lng: 120.684 },
  "南投縣埔里鎮": { lat: 23.966, lng: 120.969 },
  "南投縣竹山鎮": { lat: 23.758, lng: 120.686 },
  "南投縣集集鎮": { lat: 23.829, lng: 120.784 },
  "南投縣水里鄉": { lat: 23.812, lng: 120.855 },
  "雲林縣斗六市": { lat: 23.709, lng: 120.543 },
  "雲林縣虎尾鎮": { lat: 23.708, lng: 120.432 },
  "雲林縣西螺鎮": { lat: 23.782, lng: 120.463 },
  "雲林縣大埤鄉": { lat: 23.645, lng: 120.431 },
  "雲林縣古坑鄉": { lat: 23.643, lng: 120.562 },
  "雲林縣土庫鎮": { lat: 23.694, lng: 120.362 },
  "嘉義縣民雄鄉": { lat: 23.554, lng: 120.432 },
  "嘉義縣大林鎮": { lat: 23.604, lng: 120.472 },
  "嘉義縣水上鄉": { lat: 23.428, lng: 120.398 },
  "嘉義縣新港鄉": { lat: 23.555, lng: 120.348 },
  "嘉義縣朴子市": { lat: 23.465, lng: 120.245 },
  "嘉義市西區": { lat: 23.475, lng: 120.44 },
  "嘉義市東區": { lat: 23.484, lng: 120.458 },
  "台南市安南區": { lat: 23.048, lng: 120.185 },
  "台南市永康區": { lat: 23.026, lng: 120.257 },
  "台南市仁德區": { lat: 22.971, lng: 120.252 },
  "台南市歸仁區": { lat: 22.967, lng: 120.294 },
  "台南市新市區": { lat: 23.079, lng: 120.295 },
  "台南市善化區": { lat: 23.132, lng: 120.297 },
  "台南市官田區": { lat: 23.194, lng: 120.316 },
  "台南市麻豆區": { lat: 23.182, lng: 120.248 },
  "台南市佳里區": { lat: 23.165, lng: 120.177 },
  "台南市七股區": { lat: 23.143, lng: 120.103 },
  "台南市將軍區": { lat: 23.199, lng: 120.157 },
  "台南市西港區": { lat: 23.123, lng: 120.203 },
  "台南市安定區": { lat: 23.106, lng: 120.237 },
  "高雄市岡山區": { lat: 22.796, lng: 120.296 },
  "高雄市前鎮區": { lat: 22.586, lng: 120.317 },
  "高雄市小港區": { lat: 22.565, lng: 120.358 },
  "高雄市燕巢區": { lat: 22.793, lng: 120.362 },
  "高雄市阿蓮區": { lat: 22.883, lng: 120.327 },
  "高雄市大樹區": { lat: 22.693, lng: 120.432 },
  "高雄市大寮區": { lat: 22.605, lng: 120.395 },
  "高雄市仁武區": { lat: 22.701, lng: 120.348 },
  "高雄市橋頭區": { lat: 22.757, lng: 120.306 },
  "高雄市梓官區": { lat: 22.76, lng: 120.267 },
  "屏東縣萬巒鄉": { lat: 22.573, lng: 120.567 },
  "屏東縣內埔鄉": { lat: 22.613, lng: 120.567 },
  "屏東縣長治鄉": { lat: 22.677, lng: 120.528 },
  "屏東縣竹田鄉": { lat: 22.584, lng: 120.543 },
  "屏東縣潮州鎮": { lat: 22.551, lng: 120.543 },
  "屏東縣屏東市": { lat: 22.683, lng: 120.488 },
  "宜蘭縣礁溪鄉": { lat: 24.829, lng: 121.767 },
  "宜蘭縣冬山鄉": { lat: 24.636, lng: 121.792 },
  "宜蘭縣五結鄉": { lat: 24.685, lng: 121.797 },
  "宜蘭縣員山鄉": { lat: 24.743, lng: 121.722 },
  "宜蘭縣蘇澳鎮": { lat: 24.595, lng: 121.851 },
  "宜蘭縣羅東鎮": { lat: 24.677, lng: 121.767 },
  "宜蘭縣宜蘭市": { lat: 24.757, lng: 121.753 },
  "花蓮縣吉安鄉": { lat: 23.965, lng: 121.572 },
  "花蓮縣花蓮市": { lat: 23.991, lng: 121.62 },
  "台東縣鹿野鄉": { lat: 22.913, lng: 121.135 },
  "台東縣台東市": { lat: 22.758, lng: 121.144 },
  "金門縣金城鎮": { lat: 24.433, lng: 118.323 },
  "金門縣金湖鎮": { lat: 24.441, lng: 118.419 },
  "澎湖縣馬公市": { lat: 23.566, lng: 119.579 },
};

function resolveCoord(address, city) {
  if (!address) return { lat: null, lng: null };
  const normAddr = address.replace(/臺/g, "台");

  // 1. 嘗試比對縣市+鄉鎮市區
  for (const [distKey, coord] of Object.entries(DISTRICT_COORDS)) {
    const normKey = distKey.replace(/臺/g, "台");
    if (normAddr.includes(normKey)) {
      return coord;
    }
  }

  // 2. 嘗試比對單獨鄉鎮市區名
  for (const [distKey, coord] of Object.entries(DISTRICT_COORDS)) {
    const distName = distKey.slice(3); // 去掉縣市前綴
    if (distName.length >= 2 && normAddr.includes(distName)) {
      return coord;
    }
  }

  // 3. 降級至縣市中心點
  const normCity = (city || address.slice(0, 3)).replace(/臺/g, "台");
  if (COUNTY_COORDS[normCity]) {
    return COUNTY_COORDS[normCity];
  }

  return { lat: null, lng: null };
}

async function buildTourismFactoriesSeed() {
  console.log("🏭 下載與建置觀光工廠種子資料 (SDD6848.csv)...");
  const SOURCE_URL = "https://www.ida.gov.tw/opendata/02/SDD6848.csv";
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download SDD6848.csv`);

  const csvText = await res.text();
  const list = parseCsv(csvText);
  console.log(`取得 ${list.length} 筆觀光工廠原始資料...`);

  const items = [];
  let idSeq = 1;
  for (const row of list) {
    const name = (row["觀光工廠名稱"] || "").trim();
    if (!name) continue;

    const address = normalizeAddress(row["地址"] || "");
    const rawPhone = (row["觀光工廠預約電話"] || "").trim();
    const phone = toHalfwidthDigits(rawPhone).replace(/[\r\n]+/g, " ");
    const website = (row["網址"] || "").trim() || null;
    const region = (row["地區別"] || "").trim();
    const city = (row["縣市"] || "").trim();

    const { lat, lng } = resolveCoord(address, city);

    items.push({
      id: idSeq++,
      name,
      address: address || null,
      phone: phone || null,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      service_item: region ? `${region}｜觀光工廠` : "觀光工廠",
      extra_json: {
        website,
        region: region || null,
        city: city || null,
        dataOrg: "經濟部產業發展署",
      },
    });
  }

  const outPath = path.join(SEEDS_DIR, "tourism_factory.json");
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), "utf-8");
  console.log(`✅ 觀光工廠種子檔已生成: ${outPath} (${items.length} 筆，${items.filter((x) => x.lat != null).length} 筆具備座標)`);
}

async function buildBookstoresSeed() {
  console.log("📚 下載與建置實體書店種子資料 (typeId=M)...");
  const SOURCE_URL =
    "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=M";
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to download bookstores json`);

  const list = await res.json();
  console.log(`取得 ${list.length} 筆書店原始資料...`);

  const items = [];
  let idSeq = 1;
  for (const item of list) {
    const name = (item.name || "").trim();
    if (!name) continue;

    const cityPrefix = (item.cityName || "").trim().replace(/\s+/g, "");
    const rawAddress = (item.address || "").trim();
    const fullAddress = rawAddress.startsWith(cityPrefix) ? rawAddress : `${cityPrefix}${rawAddress}`;
    const cleanAddress = normalizeAddress(fullAddress);

    let lat = item.latitude ? Number(item.latitude) : null;
    let lng = item.longitude ? Number(item.longitude) : null;

    if (!lat || !lng || !Number.isFinite(lat) || lat === 0) {
      const fallback = resolveCoord(cleanAddress, cityPrefix);
      lat = fallback.lat;
      lng = fallback.lng;
    }

    items.push({
      id: idSeq++,
      name,
      address: cleanAddress || null,
      phone: toHalfwidthDigits(item.phone || "").trim() || null,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      service_item: item.openTime ? `營業時間：${item.openTime.trim()}` : "實體書店",
      extra_json: {
        openTime: item.openTime || null,
        website: item.website || null,
        email: item.email || null,
        intro: item.intro || null,
        arriveWay: item.arriveWay || null,
        facebook: item.facebook || null,
        name_eng: item.name_eng || null,
        dataOrg: "文化部",
      },
    });
  }

  const outPath = path.join(SEEDS_DIR, "bookstore.json");
  fs.writeFileSync(outPath, JSON.stringify(items, null, 2), "utf-8");
  console.log(`✅ 實體書店種子檔已生成: ${outPath} (${items.length} 筆，${items.filter((x) => x.lat != null).length} 筆具備座標)`);
}

async function buildHeritageMapSeed() {
  console.log("🏛️ 下載與建置文化資產地圖種子資料 (涵蓋古蹟建築、考古遺址、紀念建築、聚落群、史蹟與文化景觀 6 大法定文資)...");

  const sources = [
    // 1. 古蹟與歷史建築 (building)
    {
      category: "building",
      defaultName: "古蹟／歷史建築",
      type: "emap",
      url: "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=A",
    },
    // 2. 聚落建築群 (settlement)
    {
      category: "settlement",
      defaultName: "聚落建築群",
      type: "emap",
      url: "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=C",
    },
    // 3. 史蹟 (historical_site - 文化雲)
    {
      category: "historical_site",
      defaultName: "史蹟",
      type: "emap",
      url: "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=L",
    },
    // 4. 文化景觀 (cultural_landscape - 文化雲)
    {
      category: "cultural_landscape",
      defaultName: "文化景觀",
      type: "emap",
      url: "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=K",
    },
    // 5. 考古遺址 (archaeological_site - 文資局)
    {
      category: "archaeological_site",
      defaultName: "考古遺址",
      type: "boch",
      url: "https://data.boch.gov.tw/opendata/v2/assetsCase/2.1.json",
    },
    // 6. 史蹟 (historical_site - 文資局)
    {
      category: "historical_site",
      defaultName: "史蹟",
      type: "boch",
      url: "https://data.boch.gov.tw/opendata/v2/assetsCase/1.3.json",
    },
    // 7. 紀念建築 (memorial_building - 文資局)
    {
      category: "memorial_building",
      defaultName: "紀念建築",
      type: "boch",
      url: "https://data.boch.gov.tw/opendata/v2/assetsCase/1.4.json",
    },
    // 8. 文化景觀 (cultural_landscape - 文資局 3.1 & 3.2)
    {
      category: "cultural_landscape",
      defaultName: "文化景觀",
      type: "boch",
      url: "https://data.boch.gov.tw/opendata/v2/assetsCase/3.1.json",
    },
    {
      category: "cultural_landscape",
      defaultName: "文化景觀",
      type: "boch",
      url: "https://data.boch.gov.tw/opendata/v2/assetsCase/3.2.json",
    },
  ];

  const points = [];
  const seenKeys = new Set();
  let idSeq = 1;

  for (const src of sources) {
    try {
      const res = await fetch(src.url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) health.j172.tw" },
      });
      if (!res.ok) {
        console.warn(`⚠️ [${src.category}] ${src.url} 回傳狀態 ${res.status}`);
        continue;
      }
      const list = await res.json();
      if (!Array.isArray(list)) {
        console.warn(`⚠️ [${src.category}] 回傳格式非陣列`);
        continue;
      }

      console.log(`取得 ${src.defaultName} (${src.category}) 原始資料 ${list.length} 筆...`);

      for (const item of list) {
        if (src.type === "emap") {
          const name = (item.name || "").trim();
          if (!name) continue;

          let lat = item.latitude ? Number(item.latitude) : null;
          let lng = item.longitude ? Number(item.longitude) : null;

          // 若缺少精確經緯度，依行政區或縣市中心點進行退避定位
          if (!lat || !lng || !Number.isFinite(lat) || lat === 0) {
            const rawAddr = (item.address || "") + (item.cityName || "");
            for (const [distKey, coords] of Object.entries(DISTRICT_COORDS)) {
              if (rawAddr.includes(distKey)) {
                lat = coords.lat;
                lng = coords.lng;
                break;
              }
            }
            if (!lat || !lng) {
              const cityKey = item.cityName || Object.keys(COUNTY_COORDS).find((c) => rawAddr.includes(c));
              if (cityKey && COUNTY_COORDS[cityKey]) {
                lat = COUNTY_COORDS[cityKey].lat;
                lng = COUNTY_COORDS[cityKey].lng;
              }
            }
          }

          if (!lat || !lng || !Number.isFinite(lat) || lat === 0) continue;

          const dedupKey = `${src.category}_${name}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          points.push({
            id: idSeq++,
            caseId: String(item.mainTypePk || idSeq).trim(),
            category: src.category,
            caseName: name,
            assetsTypeNames: item.level || item.typeName || src.defaultName,
            classifyCode: item.type || null,
            classifyName: item.typeName || src.defaultName,
            cityName: item.cityName || null,
            distName: null,
            address: item.address || null,
            pastHistory: item.intro || null,
            registerReason: item.level || null,
            govInstitutionName: item.headCityName || null,
            lng: Number(lng),
            lat: Number(lat),
            imageUrl: item.representImage || null,
            imageSource: item.srcWebsite || null,
          });
        } else {
          // boch format
          const name = (item.caseName || "").trim();
          if (!name) continue;

          let lat = item.latitude ? Number(item.latitude) : null;
          let lng = item.longitude ? Number(item.longitude) : null;

          const addrObj = Array.isArray(item.addresses) ? item.addresses[0] : null;
          const cityName = addrObj?.cityName || null;
          const distName = addrObj?.distName || null;
          const address = addrObj?.address || null;

          if (!lat || !lng || !Number.isFinite(lat) || lat === 0) {
            const rawAddr = (address || "") + (cityName || "") + (distName || "");
            for (const [distKey, coords] of Object.entries(DISTRICT_COORDS)) {
              if (rawAddr.includes(distKey)) {
                lat = coords.lat;
                lng = coords.lng;
                break;
              }
            }
            if (!lat || !lng) {
              const cityKey = cityName || Object.keys(COUNTY_COORDS).find((c) => rawAddr.includes(c));
              if (cityKey && COUNTY_COORDS[cityKey]) {
                lat = COUNTY_COORDS[cityKey].lat;
                lng = COUNTY_COORDS[cityKey].lng;
              }
            }
          }

          if (!lat || !lng || !Number.isFinite(lat) || lat === 0) continue;

          const dedupKey = `${src.category}_${name}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          points.push({
            id: idSeq++,
            caseId: String(item.caseId || idSeq).trim(),
            category: src.category,
            caseName: name,
            assetsTypeNames: item.assetsClassifyName || src.defaultName,
            classifyCode: item.assetsClassifyCode || null,
            classifyName: item.assetsClassifyName || src.defaultName,
            cityName,
            distName,
            address,
            pastHistory: item.pastHistory || null,
            registerReason: item.registerReason || null,
            govInstitutionName: item.govInstitutionName || null,
            lng: Number(lng),
            lat: Number(lat),
            imageUrl: item.representImage || null,
            imageSource: item.representImageSource || item.caseUrl || null,
          });
        }
      }
    } catch (err) {
      console.warn(`下載 ${src.defaultName} 失敗:`, err?.message || err);
    }
  }

  const payload = {
    ok: true,
    points,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(HERITAGE_SEED_PATH, JSON.stringify(payload, null, 2), "utf-8");

  const catCounts = {};
  for (const p of points) catCounts[p.category] = (catCounts[p.category] || 0) + 1;

  console.log(
    `✅ 文化資產地圖種子檔已生成: ${HERITAGE_SEED_PATH} (總計 ${points.length} 點：` +
      Object.entries(catCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") +
      ")",
  );
}

async function main() {
  await buildTourismFactoriesSeed();
  await buildBookstoresSeed();
  await buildHeritageMapSeed();
  console.log("\n🎉 全部種子檔建置完成！");
}

main().catch((err) => {
  console.error("建置失敗:", err);
  process.exit(1);
});
