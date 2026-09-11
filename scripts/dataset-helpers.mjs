#!/usr/bin/env node
/**
 * scripts/import-all-requested-datasets.mjs
 *
 * Comprehensive ingestion script for the 26 requested datasets across
 * Taipei City, New Taipei City, Taoyuan City, Kaohsiung City, and MOA.
 *
 * Normalizes addresses, converts TWD97 to WGS84, pre-geocodes with
 * district centroids, and updates all static seeds and database fallbacks.
 */

import fs from "node:fs";
import path from "node:path";
import { twd97ToWgs84 } from "./import-tgos-geocode-results.mjs";

const ROOT_DIR = process.cwd();
const SEEDS_DIR = path.join(ROOT_DIR, "data", "facilities-seeds");

if (!fs.existsSync(SEEDS_DIR)) {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

// 台灣主要行政區中心點對照字典
const DISTRICT_COORDS = {
  "台北市中正區": { lat: 25.0323, lng: 121.5183 },
  "台北市大同區": { lat: 25.0633, lng: 121.5133 },
  "台北市中山區": { lat: 25.0685, lng: 121.5338 },
  "台北市松山區": { lat: 25.0599, lng: 121.5577 },
  "台北市大安區": { lat: 25.0264, lng: 121.5435 },
  "台北市萬華區": { lat: 25.0290, lng: 121.4980 },
  "台北市信義區": { lat: 25.0340, lng: 121.5650 },
  "台北市士林區": { lat: 25.0880, lng: 121.5240 },
  "台北市北投區": { lat: 25.1320, lng: 121.5000 },
  "台北市內湖區": { lat: 25.0700, lng: 121.5890 },
  "台北市南港區": { lat: 25.0550, lng: 121.6070 },
  "台北市文山區": { lat: 24.9890, lng: 121.5750 },
  "新北市板橋區": { lat: 25.0110, lng: 121.4630 },
  "新北市三重區": { lat: 25.0610, lng: 121.4990 },
  "新北市中和區": { lat: 25.0010, lng: 121.5000 },
  "新北市永和區": { lat: 25.0080, lng: 121.5170 },
  "新北市新莊區": { lat: 25.0360, lng: 121.4500 },
  "新北市新店區": { lat: 24.9680, lng: 121.5420 },
  "新北市樹林區": { lat: 24.9910, lng: 121.4240 },
  "新北市鶯歌區": { lat: 24.9550, lng: 121.3550 },
  "新北市三峽區": { lat: 24.9340, lng: 121.3700 },
  "新北市淡水區": { lat: 25.1760, lng: 121.4440 },
  "新北市汐止區": { lat: 25.0630, lng: 121.6420 },
  "新北市瑞芳區": { lat: 25.1090, lng: 121.8060 },
  "新北市土城區": { lat: 24.9720, lng: 121.4440 },
  "新北市蘆洲區": { lat: 25.0850, lng: 121.4740 },
  "新北市五股區": { lat: 25.0830, lng: 121.4380 },
  "新北市泰山區": { lat: 25.0580, lng: 121.4320 },
  "新北市林口區": { lat: 25.0770, lng: 121.3910 },
  "新北市深坑區": { lat: 25.0020, lng: 121.6160 },
  "新北市石碇區": { lat: 24.9920, lng: 121.6580 },
  "新北市坪林區": { lat: 24.9370, lng: 121.7110 },
  "新北市三芝區": { lat: 25.2580, lng: 121.5010 },
  "新北市石門區": { lat: 25.2900, lng: 121.5680 },
  "新北市八里區": { lat: 25.1470, lng: 121.3980 },
  "新北市平溪區": { lat: 25.0260, lng: 121.7380 },
  "新北市雙溪區": { lat: 25.0340, lng: 121.8650 },
  "新北市貢寮區": { lat: 25.0180, lng: 121.9080 },
  "新北市金山區": { lat: 25.2220, lng: 121.6370 },
  "新北市萬里區": { lat: 25.1790, lng: 121.6890 },
  "新北市烏來區": { lat: 24.8650, lng: 121.5510 },
  "桃園市桃園區": { lat: 24.9936, lng: 121.3010 },
  "桃園市中壢區": { lat: 24.9650, lng: 121.2250 },
  "桃園市大溪區": { lat: 24.8830, lng: 121.2870 },
  "桃園市楊梅區": { lat: 24.9140, lng: 121.1460 },
  "桃園市蘆竹區": { lat: 25.0470, lng: 121.2930 },
  "桃園市大園區": { lat: 25.0640, lng: 121.1970 },
  "桃園市龜山區": { lat: 24.9930, lng: 121.3380 },
  "桃園市八德區": { lat: 24.9290, lng: 121.2830 },
  "桃園市龍潭區": { lat: 24.8630, lng: 121.2160 },
  "桃園市平鎮區": { lat: 24.9450, lng: 121.2180 },
  "桃園市新屋區": { lat: 24.9720, lng: 121.1060 },
  "桃園市觀音區": { lat: 25.0350, lng: 121.0820 },
  "桃園市復興區": { lat: 24.8210, lng: 121.3520 },
  "高雄市新興區": { lat: 22.6310, lng: 120.3100 },
  "高雄市前金區": { lat: 22.6270, lng: 120.2970 },
  "高雄市苓雅區": { lat: 22.6220, lng: 120.3120 },
  "高雄市鹽埕區": { lat: 22.6250, lng: 120.2840 },
  "高雄市鼓山區": { lat: 22.6400, lng: 120.2780 },
  "高雄市旗津區": { lat: 22.5700, lng: 120.2980 },
  "高雄市前鎮區": { lat: 22.5860, lng: 120.3180 },
  "高雄市三民區": { lat: 22.6460, lng: 120.3170 },
  "高雄市楠梓區": { lat: 22.7290, lng: 120.3260 },
  "高雄市小港區": { lat: 22.5650, lng: 120.3570 },
  "高雄市左營區": { lat: 22.6900, lng: 120.2950 },
  "高雄市仁武區": { lat: 22.7010, lng: 120.3480 },
  "高雄市大社區": { lat: 22.7300, lng: 120.3470 },
  "高雄市岡山區": { lat: 22.7960, lng: 120.2960 },
  "高雄市路竹區": { lat: 22.8550, lng: 120.2610 },
  "高雄市阿蓮區": { lat: 22.8830, lng: 120.3270 },
  "高雄市田寮區": { lat: 22.8790, lng: 120.3600 },
  "高雄市燕巢區": { lat: 22.7930, lng: 120.3620 },
  "高雄市橋頭區": { lat: 22.7570, lng: 120.3060 },
  "高雄市梓官區": { lat: 22.7600, lng: 120.2670 },
  "高雄市彌陀區": { lat: 22.7820, lng: 120.2470 },
  "高雄市永安區": { lat: 22.8180, lng: 120.2280 },
  "高雄市湖內區": { lat: 22.9060, lng: 120.2160 },
  "高雄市鳳山區": { lat: 22.6270, lng: 120.3570 },
  "高雄市大寮區": { lat: 22.6050, lng: 120.3950 },
  "高雄市林園區": { lat: 22.5020, lng: 120.3950 },
  "高雄市鳥松區": { lat: 22.6590, lng: 120.3640 },
  "高雄市大樹區": { lat: 22.6930, lng: 120.4330 },
  "高雄市旗山區": { lat: 22.8880, lng: 120.4810 },
  "高雄市美濃區": { lat: 22.8980, lng: 120.5410 },
  "高雄市六龜區": { lat: 22.9970, lng: 120.6330 },
  "高雄市內門區": { lat: 22.9430, lng: 120.4620 },
  "高雄市杉林區": { lat: 22.9710, lng: 120.5390 },
  "高雄市甲仙區": { lat: 23.0820, lng: 120.5910 },
  "高雄市桃源區": { lat: 23.1600, lng: 120.7600 },
  "高雄市那瑪夏區": { lat: 23.2380, lng: 120.6960 },
  "高雄市茂林區": { lat: 22.8840, lng: 120.6630 },
};

const COUNTY_COORDS = {
  台北市: { lat: 25.0375, lng: 121.5637 },
  臺北市: { lat: 25.0375, lng: 121.5637 },
  新北市: { lat: 25.0125, lng: 121.4658 },
  基隆市: { lat: 25.1322, lng: 121.7444 },
  桃園市: { lat: 24.9936, lng: 121.3010 },
  新竹市: { lat: 24.8039, lng: 120.9647 },
  新竹縣: { lat: 24.8387, lng: 121.0177 },
  苗栗縣: { lat: 24.5601, lng: 120.8214 },
  台中市: { lat: 24.1627, lng: 120.6473 },
  臺中市: { lat: 24.1627, lng: 120.6473 },
  彰化縣: { lat: 24.0816, lng: 120.5385 },
  南投縣: { lat: 23.9100, lng: 120.6860 },
  雲林縣: { lat: 23.7093, lng: 120.4313 },
  嘉義市: { lat: 23.4800, lng: 120.4491 },
  嘉義縣: { lat: 23.4518, lng: 120.2555 },
  台南市: { lat: 22.9997, lng: 120.2270 },
  臺南市: { lat: 22.9997, lng: 120.2270 },
  高雄市: { lat: 22.6273, lng: 120.3014 },
  屏東縣: { lat: 22.6826, lng: 120.4879 },
  宜蘭縣: { lat: 24.7570, lng: 121.7530 },
  花蓮縣: { lat: 23.9912, lng: 121.6196 },
  台東縣: { lat: 22.7583, lng: 121.1444 },
  臺東縣: { lat: 22.7583, lng: 121.1444 },
  澎湖縣: { lat: 23.5658, lng: 119.5793 },
  金門縣: { lat: 24.4327, lng: 118.3226 },
  連江縣: { lat: 26.1558, lng: 119.9519 },
};

export function inferCoords(address, defaultCounty = "") {
  if (!address) return null;
  const full = (address.startsWith("台") || address.startsWith("臺") || address.startsWith("新") || address.startsWith("桃") || address.startsWith("高") || address.startsWith("宜") || address.startsWith("花") || address.startsWith("屏"))
    ? address
    : defaultCounty + address;

  for (const [key, coords] of Object.entries(DISTRICT_COORDS)) {
    const dName = key.replace(/^[^\u4e00-\u9fa5]+/, "").slice(3); // e.g. "中正區"
    if (full.includes(key) || (full.includes(dName) && key.startsWith(full.slice(0, 3)))) {
      return coords;
    }
  }

  for (const [cName, coords] of Object.entries(COUNTY_COORDS)) {
    if (full.includes(cName)) {
      return coords;
    }
  }

  return { lat: 25.0375, lng: 121.5637 };
}

export async function fetchTextWithEncoding(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("big5").decode(buf);
  }
}

export async function fetchJson(url) {
  const text = await fetchTextWithEncoding(url);
  return JSON.parse(text);
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"(.*)"$/, "$1").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(",");
    const cols = [];
    let cur = "";
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        cols.push(cur.trim().replace(/^"(.*)"$/, "$1"));
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim().replace(/^"(.*)"$/, "$1"));
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] || ""; });
    rows.push(obj);
  }
  return rows;
}
