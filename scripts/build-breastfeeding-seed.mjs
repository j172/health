#!/usr/bin/env node
/**
 * scripts/build-breastfeeding-seed.mjs
 *
 * Scrapes national breastfeeding rooms across all 22 counties from HPA
 * Mammy website (mammy.hpa.gov.tw/Map/BreastfeedingRoom).
 *
 * Saves normalized points with official GPS coordinates to:
 *   data/breastfeeding-rooms-seed.json
 *
 * Run:
 *   node scripts/build-breastfeeding-seed.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const ROOT_DIR = process.cwd();
const SEED_PATH = path.join(ROOT_DIR, "data", "breastfeeding-rooms-seed.json");

const TAIWAN_COUNTIES = [
  "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
];

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 health.j172.tw";

async function fetchCounty(county) {
  const url = `https://mammy.hpa.gov.tw/Map/BreastfeedingRoom?county=${encodeURIComponent(county)}&district=`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    console.warn(`⚠️ 抓取 ${county} 失敗: HTTP ${res.status}`);
    return [];
  }
  const html = await res.text();
  const $ = load(html);

  const rooms = [];
  $("[id*=\"code_\"]").each((_, el) => {
    const idAttr = $(el).attr("id") || "";
    const match = idAttr.match(/code_(.*?)_([0-9.]+),([0-9.]+)/);
    const lat = match ? Number(match[2]) : null;
    const lng = match ? Number(match[3]) : null;

    const lis = $(el).find("li").toArray().map((li) => $(li).text().trim()).filter(Boolean);
    const name = lis[0] || (match ? match[1].trim() : "");
    const address = lis[1] || "";
    const phone = lis[2] || "";

    if (!name || !lat || !lng) return;

    rooms.push({
      county,
      name,
      address,
      phone,
      lat,
      lng,
    });
  });

  return rooms;
}

const STATUTORY_KEYWORDS = [
  "公所", "戶政", "衛生所", "地政", "警察局", "派出所", "分局", "國稅局", "稅務", "郵局", "機關", "市府", "縣府",
  "車站", "捷運", "高鐵", "火車站", "機場", "航空站", "轉運站",
  "百貨", "新光三越", "遠東", "SOGO", "家樂福", "大潤發", "好市多", "Costco", "Outlet", "購物中心", "愛買",
  "醫院", "榮總", "長庚", "台大醫院", "市立醫院", "馬偕", "慈濟", "成大醫院",
  "圖書館", "文化中心", "博物館", "美術館", "演藝廳", "展覽館", "客運",
  "運動中心", "體育館", "活動中心",
];

function classifySettingType(name, address) {
  const target = (name || "") + (address || "");
  const isStatutory = STATUTORY_KEYWORDS.some((kw) => target.includes(kw));
  return isStatutory ? "statutory" : "voluntary";
}

async function main() {
  console.log("🍼 開始抓取全台 22 縣市哺集乳室資料...");
  const allRooms = [];
  const seenKeys = new Set();
  let idSeq = 1;

  for (const county of TAIWAN_COUNTIES) {
    process.stdout.write(`  抓取 ${county}... `);
    try {
      const rooms = await fetchCounty(county);
      let added = 0;
      for (const r of rooms) {
        const key = `${r.name}_${r.address || ""}_${r.lat}_${r.lng}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const settingType = classifySettingType(r.name, r.address);

        allRooms.push({
          id: idSeq++,
          name: r.name,
          county: r.county,
          address: r.address,
          phone: r.phone || null,
          lat: r.lat,
          lng: r.lng,
          settingType,
          settingTypeLabel: settingType === "statutory" ? "依法設置" : "自願設置",
          source: "衛生福利部國民健康署 孕產兒關懷網站",
        });
        added++;
      }
      console.log(`取得 ${rooms.length} 筆（新納入 ${added} 筆）`);
    } catch (err) {
      console.log(`錯誤: ${err.message}`);
    }
  }

  const payload = {
    ok: true,
    total: allRooms.length,
    updatedAt: new Date().toISOString(),
    points: allRooms,
  };

  fs.writeFileSync(SEED_PATH, JSON.stringify(payload, null, 2), "utf-8");

  const fallbackDir = path.join(ROOT_DIR, "data", "facilities-seeds");
  if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
  fs.writeFileSync(path.join(fallbackDir, "breastfeeding-rooms.json"), JSON.stringify(payload, null, 2), "utf-8");

  const statutoryCount = allRooms.filter((x) => x.settingType === "statutory").length;
  const voluntaryCount = allRooms.filter((x) => x.settingType === "voluntary").length;

  console.log(`\n✅ 全國哺集乳室種子檔已生成: ${SEED_PATH}`);
  console.log(`   總計: ${allRooms.length} 處哺集乳室（依法設置: ${statutoryCount} 處，自願設置: ${voluntaryCount} 處）`);
}

main().catch((err) => {
  console.error("建置失敗:", err);
  process.exit(1);
});
