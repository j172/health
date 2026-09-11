import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT_DIR = process.cwd();

// 縣市中心點經緯度
const COUNTY_COORDS = {
  台北市: { lat: 25.0375, lng: 121.5637 },
  臺北市: { lat: 25.0375, lng: 121.5637 },
  新北市: { lat: 25.0116, lng: 121.4657 },
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
  基隆市安樂區: { lat: 25.132, lng: 121.713 },
  基隆市七堵區: { lat: 25.096, lng: 121.714 },
  基隆市中山區: { lat: 25.143, lng: 121.737 },
  基隆市中正區: { lat: 25.148, lng: 121.776 },
  基隆市仁愛區: { lat: 25.127, lng: 121.741 },
  基隆市信義區: { lat: 25.13, lng: 121.761 },
  基隆市暖暖區: { lat: 25.099, lng: 121.736 },
  新北市林口區: { lat: 25.077, lng: 121.391 },
  新北市鶯歌區: { lat: 24.955, lng: 121.355 },
  新北市八里區: { lat: 25.147, lng: 121.398 },
  新北市三峽區: { lat: 24.934, lng: 121.37 },
  新北市五股區: { lat: 25.083, lng: 121.438 },
  新北市瑞芳區: { lat: 25.109, lng: 121.806 },
  新北市土城區: { lat: 24.972, lng: 121.444 },
  新北市淡水區: { lat: 25.176, lng: 121.444 },
  新北市樹林區: { lat: 24.991, lng: 121.424 },
  新北市板橋區: { lat: 25.011, lng: 121.463 },
  新北市三重區: { lat: 25.061, lng: 121.499 },
  新北市新店區: { lat: 24.968, lng: 121.542 },
  新北市中和區: { lat: 25.001, lng: 121.5 },
  新北市永和區: { lat: 25.008, lng: 121.516 },
  新北市汐止區: { lat: 25.063, lng: 121.642 },
  新北市蘆洲區: { lat: 25.085, lng: 121.473 },
  新北市新莊區: { lat: 25.036, lng: 121.45 },
  台北市內湖區: { lat: 25.07, lng: 121.589 },
  台北市大同區: { lat: 25.063, lng: 121.513 },
  台北市中正區: { lat: 25.032, lng: 121.518 },
  台北市萬華區: { lat: 25.029, lng: 121.5 },
  台北市信義區: { lat: 25.034, lng: 121.565 },
  台北市大安區: { lat: 25.026, lng: 121.544 },
  台北市文山區: { lat: 24.989, lng: 121.575 },
  台北市松山區: { lat: 25.059, lng: 121.558 },
  台北市南港區: { lat: 25.055, lng: 121.607 },
  台北市士林區: { lat: 25.093, lng: 121.526 },
  台北市北投區: { lat: 25.132, lng: 121.499 },
  台北市中山區: { lat: 25.068, lng: 121.534 },
  臺北市內湖區: { lat: 25.07, lng: 121.589 },
  臺北市大同區: { lat: 25.063, lng: 121.513 },
  臺北市中正區: { lat: 25.032, lng: 121.518 },
  臺北市萬華區: { lat: 25.029, lng: 121.5 },
  臺北市信義區: { lat: 25.034, lng: 121.565 },
  臺北市大安區: { lat: 25.026, lng: 121.544 },
  臺北市文山區: { lat: 24.989, lng: 121.575 },
  臺北市松山區: { lat: 25.059, lng: 121.558 },
  臺北市南港區: { lat: 25.055, lng: 121.607 },
  臺北市士林區: { lat: 25.093, lng: 121.526 },
  臺北市北投區: { lat: 25.132, lng: 121.499 },
  臺北市中山區: { lat: 25.068, lng: 121.534 },
  桃園市龜山區: { lat: 24.993, lng: 121.338 },
  桃園市楊梅區: { lat: 24.914, lng: 121.146 },
  桃園市蘆竹區: { lat: 25.047, lng: 121.293 },
  桃園市八德區: { lat: 24.929, lng: 121.283 },
  桃園市大溪區: { lat: 24.883, lng: 121.287 },
  桃園市龍潭區: { lat: 24.863, lng: 121.216 },
  桃園市中壢區: { lat: 24.965, lng: 121.225 },
  桃園市桃園區: { lat: 24.993, lng: 121.301 },
  桃園市大園區: { lat: 25.064, lng: 121.197 },
  桃園市新屋區: { lat: 24.972, lng: 121.106 },
  桃園市平鎮區: { lat: 24.945, lng: 121.218 },
  新竹市東區: { lat: 24.802, lng: 120.978 },
  新竹市北區: { lat: 24.815, lng: 120.957 },
  新竹市香山區: { lat: 24.786, lng: 120.932 },
  新竹縣竹北市: { lat: 24.839, lng: 121.018 },
  新竹縣湖口鄉: { lat: 24.904, lng: 121.044 },
  新竹縣新埔鎮: { lat: 24.829, lng: 121.073 },
  新竹縣關西鎮: { lat: 24.795, lng: 121.176 },
  新竹縣芎林鄉: { lat: 24.774, lng: 121.078 },
  新竹縣竹東鎮: { lat: 24.734, lng: 121.087 },
  苗栗縣竹南鎮: { lat: 24.686, lng: 120.878 },
  苗栗縣頭份市: { lat: 24.687, lng: 120.912 },
  苗栗縣銅鑼鄉: { lat: 24.486, lng: 120.787 },
  苗栗縣公館鄉: { lat: 24.499, lng: 120.825 },
  苗栗縣苑裡鎮: { lat: 24.442, lng: 120.655 },
  苗栗縣通霄鎮: { lat: 24.489, lng: 120.677 },
  苗栗縣苗栗市: { lat: 24.56, lng: 120.821 },
  台中市西屯區: { lat: 24.181, lng: 120.638 },
  台中市南屯區: { lat: 24.138, lng: 120.639 },
  台中市北屯區: { lat: 24.175, lng: 120.697 },
  台中市南區: { lat: 24.12, lng: 120.665 },
  台中市東區: { lat: 24.135, lng: 120.698 },
  台中市北區: { lat: 24.156, lng: 120.684 },
  台中市中區: { lat: 24.143, lng: 120.681 },
  台中市西區: { lat: 24.144, lng: 120.662 },
  台中市大雅區: { lat: 24.229, lng: 120.648 },
  台中市神岡區: { lat: 24.258, lng: 120.662 },
  台中市豐原區: { lat: 24.252, lng: 120.722 },
  台中市潭子區: { lat: 24.208, lng: 120.706 },
  台中市大甲區: { lat: 24.348, lng: 120.623 },
  台中市清水區: { lat: 24.269, lng: 120.56 },
  台中市沙鹿區: { lat: 24.234, lng: 120.567 },
  台中市梧棲區: { lat: 24.255, lng: 120.532 },
  台中市太平區: { lat: 24.127, lng: 120.718 },
  台中市大里區: { lat: 24.099, lng: 120.678 },
  台中市烏日區: { lat: 24.108, lng: 120.624 },
  臺中市西屯區: { lat: 24.181, lng: 120.638 },
  臺中市南屯區: { lat: 24.138, lng: 120.639 },
  臺中市北屯區: { lat: 24.175, lng: 120.697 },
  臺中市南區: { lat: 24.12, lng: 120.665 },
  臺中市東區: { lat: 24.135, lng: 120.698 },
  臺中市北區: { lat: 24.156, lng: 120.684 },
  臺中市中區: { lat: 24.143, lng: 120.681 },
  臺中市西區: { lat: 24.144, lng: 120.662 },
  臺中市豐原區: { lat: 24.252, lng: 120.722 },
  彰化縣鹿港鎮: { lat: 24.057, lng: 120.435 },
  彰化縣員林市: { lat: 23.959, lng: 120.574 },
  彰化縣彰化市: { lat: 24.081, lng: 120.539 },
  彰化縣福興鄉: { lat: 24.049, lng: 120.443 },
  彰化縣田中鎮: { lat: 23.861, lng: 120.598 },
  南投縣南投市: { lat: 23.91, lng: 120.686 },
  南投縣草屯鎮: { lat: 23.978, lng: 120.683 },
  南投縣埔里鎮: { lat: 23.966, lng: 120.967 },
  南投縣竹山鎮: { lat: 23.758, lng: 120.682 },
  雲林縣斗六市: { lat: 23.708, lng: 120.544 },
  雲林縣虎尾鎮: { lat: 23.71, lng: 120.432 },
  雲林縣西螺鎮: { lat: 23.799, lng: 120.462 },
  雲林縣北港鎮: { lat: 23.575, lng: 120.303 },
  嘉義市東區: { lat: 23.483, lng: 120.463 },
  嘉義市西區: { lat: 23.477, lng: 120.435 },
  嘉義縣朴子市: { lat: 23.464, lng: 120.245 },
  嘉義縣太保市: { lat: 23.46, lng: 120.332 },
  嘉義縣民雄鄉: { lat: 23.553, lng: 120.429 },
  台南市安南區: { lat: 23.048, lng: 120.185 },
  台南市永康區: { lat: 23.026, lng: 120.257 },
  台南市仁德區: { lat: 22.971, lng: 120.252 },
  台南市善化區: { lat: 23.132, lng: 120.297 },
  台南市新市區: { lat: 23.079, lng: 120.295 },
  台南市麻豆區: { lat: 23.182, lng: 120.248 },
  台南市佳里區: { lat: 23.165, lng: 120.177 },
  台南市歸仁區: { lat: 22.967, lng: 120.294 },
  台南市新營區: { lat: 23.31, lng: 120.316 },
  台南市中西區: { lat: 22.992, lng: 120.198 },
  台南市東區: { lat: 22.982, lng: 120.224 },
  台南市南區: { lat: 22.961, lng: 120.193 },
  台南市北區: { lat: 23.01, lng: 120.207 },
  台南市安平區: { lat: 22.998, lng: 120.163 },
  臺南市中西區: { lat: 22.992, lng: 120.198 },
  臺南市東區: { lat: 22.982, lng: 120.224 },
  臺南市新營區: { lat: 23.31, lng: 120.316 },
  高雄市前鎮區: { lat: 22.589, lng: 120.318 },
  高雄市大寮區: { lat: 22.607, lng: 120.398 },
  高雄市岡山區: { lat: 22.796, lng: 120.296 },
  高雄市小港區: { lat: 22.565, lng: 120.338 },
  高雄市大樹區: { lat: 22.693, lng: 120.432 },
  高雄市路竹區: { lat: 22.857, lng: 120.261 },
  高雄市橋頭區: { lat: 22.758, lng: 120.306 },
  高雄市苓雅區: { lat: 22.622, lng: 120.312 },
  高雄市新興區: { lat: 22.628, lng: 120.306 },
  高雄市前金區: { lat: 22.627, lng: 120.294 },
  高雄市三民區: { lat: 22.646, lng: 120.313 },
  高雄市鹽埕區: { lat: 22.624, lng: 120.283 },
  高雄市鼓山區: { lat: 22.658, lng: 120.279 },
  高雄市左營區: { lat: 22.69, lng: 120.295 },
  高雄市楠梓區: { lat: 22.729, lng: 120.326 },
  高雄市鳳山區: { lat: 22.626, lng: 120.357 },
  屏東縣屏東市: { lat: 22.673, lng: 120.488 },
  屏東縣潮州鎮: { lat: 22.55, lng: 120.543 },
  屏東縣東港鎮: { lat: 22.467, lng: 120.455 },
  屏東縣恆春鎮: { lat: 22.004, lng: 120.744 },
  宜蘭縣宜蘭市: { lat: 24.757, lng: 121.753 },
  宜蘭縣羅東鎮: { lat: 24.677, lng: 121.771 },
  宜蘭縣冬山鄉: { lat: 24.636, lng: 121.792 },
  宜蘭縣礁溪鄉: { lat: 24.823, lng: 121.771 },
  花蓮縣花蓮市: { lat: 23.991, lng: 121.62 },
  花蓮縣吉安鄉: { lat: 23.957, lng: 121.579 },
  花蓮縣玉里鎮: { lat: 23.336, lng: 121.312 },
  台東縣台東市: { lat: 22.758, lng: 121.144 },
  臺東縣臺東市: { lat: 22.758, lng: 121.144 },
  澎湖縣馬公市: { lat: 23.565, lng: 119.579 },
  金門縣金城鎮: { lat: 24.432, lng: 118.322 },
  連江縣南竿鄉: { lat: 26.155, lng: 119.951 },
};

const CATEGORY_LABELS = {
  "1": "🎵 音樂表演",
  "2": "🎭 戲劇演出",
  "3": "💃 舞蹈表演",
  "4": "🎨 親子活動",
  "5": "🎸 獨立音樂",
  "6": "🖼️ 藝文展覽",
  "7": "🎤 講座工作坊",
  "8": "🎬 電影與沉浸",
  "9": "🎪 聚會市集",
  "10": "🏮 民俗節慶",
  "11": "🤹 綜藝表演",
  "12": "🗺️ 觀光文化",
  "13": "🏆 藝文競賽",
  "14": "📣 徵選甄選",
  "15": "📌 其他多元",
  "16": "🏅 競賽活動",
  "17": "✨ 演唱會活動",
  "18": "🚶 導覽走讀",
  "19": "📚 研習課程",
  festival: "🏮 全國節慶活動",
  venue_h: "🏛️ 文化生活圈場館",
};

const TAIWAN_CITIES = [
  "基隆市", "臺北市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "臺中市", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市",
  "嘉義縣", "臺南市", "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

function extractCity(address = "", name = "") {
  const combined = `${address} ${name}`;
  for (const c of TAIWAN_CITIES) {
    if (combined.includes(c)) {
      if (c === "台北市") return "臺北市";
      if (c === "台中市") return "臺中市";
      if (c === "台南市") return "臺南市";
      if (c === "台東縣") return "臺東縣";
      return c;
    }
  }
  return "";
}

function resolveCoords(address = "", cityName = "") {
  const target = `${cityName} ${address}`;
  for (const [distKey, coords] of Object.entries(DISTRICT_COORDS)) {
    if (target.includes(distKey) || (distKey.length >= 5 && target.includes(distKey.slice(3)))) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }
  for (const [countyKey, coords] of Object.entries(COUNTY_COORDS)) {
    if (target.includes(countyKey)) {
      return { lat: coords.lat, lng: coords.lng };
    }
  }
  return { lat: 25.0375, lng: 121.5637 };
}

async function fetchJsonSafely(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || !text.trim()) return [];
    return JSON.parse(text);
  } catch (err) {
    console.warn(`[Build Seed] Fetch error for ${url}:`, err.message);
    return [];
  }
}

async function buildCulturalEventsSeed() {
  console.log("=== Building Cultural Events Seed (19 categories + festival + venue_h) ===");
  const allEvents = [];
  const seenUids = new Set();

  // 1. Fetch 19 categories
  for (let i = 1; i <= 19; i++) {
    const cat = String(i);
    const url = `https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=${cat}`;
    const list = await fetchJsonSafely(url);
    const catLabel = CATEGORY_LABELS[cat] || "🎨 藝文活動";
    console.log(`- Category ${cat} (${catLabel}): fetched ${list.length} records`);

    for (const item of list) {
      const uid = String(item.UID || "").trim();
      const title = String(item.title || "").trim();
      if (!uid || !title || seenUids.has(uid)) continue;
      seenUids.add(uid);

      const shows = (item.showInfo || []).map((s) => {
        const loc = String(s.location || "").trim();
        const locName = String(s.locationName || "").trim();
        const city = extractCity(loc, locName);
        const lat = s.latitude ? parseFloat(String(s.latitude)) : null;
        const lng = s.longitude ? parseFloat(String(s.longitude)) : null;
        return {
          time: String(s.time || "").trim(),
          location: loc,
          locationName: locName,
          city,
          onSales: String(s.onSales || "N").trim(),
          price: String(s.price || "").trim(),
          latitude: lat && !isNaN(lat) ? lat : null,
          longitude: lng && !isNaN(lng) ? lng : null,
          endTime: String(s.endTime || "").trim(),
        };
      });

      allEvents.push({
        id: uid,
        title,
        titleEn: null,
        category: cat,
        categoryLabel: catLabel,
        description: String(item.descriptionFilterHtml || item.comment || "").trim(),
        descriptionEn: null,
        imageUrl: item.imageUrl ? String(item.imageUrl).trim() : null,
        masterUnit: String(item.masterUnit || item.showUnit || "").trim() || null,
        startDate: String(item.startDate || "").trim(),
        endDate: String(item.endDate || "").trim(),
        sourceWebPromote: item.sourceWebPromote ? String(item.sourceWebPromote).trim() : null,
        webSales: item.webSales ? String(item.webSales).trim() : null,
        shows,
      });
    }
  }

  // 2. Fetch festivals
  const fUrl = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindFestivalTypeJ";
  const fList = await fetchJsonSafely(fUrl);
  console.log(`- Festivals: fetched ${fList.length} records`);
  for (const item of fList) {
    const uid = `FESTIVAL_${item.actId || item.actName}`;
    if (seenUids.has(uid)) continue;
    seenUids.add(uid);

    const addr = String(item.address || "").trim();
    const cityName = String(item.cityName || "").trim();
    const city = extractCity(addr, cityName);
    const coords = resolveCoords(addr, cityName);
    const lat = item.latitude ? parseFloat(String(item.latitude)) : coords.lat;
    const lng = item.longitude ? parseFloat(String(item.longitude)) : coords.lng;

    allEvents.push({
      id: uid,
      title: String(item.actName || "").trim(),
      titleEn: null,
      category: "festival",
      categoryLabel: CATEGORY_LABELS.festival,
      description: String(item.description || "").trim(),
      descriptionEn: null,
      imageUrl: item.imageUrl
        ? (String(item.imageUrl).startsWith("http")
            ? String(item.imageUrl)
            : `https://cloud.culture.tw${item.imageUrl}`)
        : null,
      masterUnit: String(item.org || "").trim() || null,
      startDate: String(item.startTime || "").trim(),
      endDate: String(item.endTime || "").trim(),
      sourceWebPromote: item.website ? String(item.website).trim() : null,
      webSales: null,
      shows: [
        {
          time: String(item.cycle || item.startTime || "").trim(),
          location: addr,
          locationName: cityName || addr,
          city,
          latitude: lat,
          longitude: lng,
          price: String(item.charge || "").trim() || "免費",
          onSales: "N",
        },
      ],
    });
  }

  // 3. Fetch cultural venues (typeId=H)
  const hUrl = "https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId=H";
  const hList = await fetchJsonSafely(hUrl);
  console.log(`- Venues (typeId=H): fetched ${hList.length} records`);
  for (const item of hList) {
    const uid = `VENUE_H_${item.name}_${item.mainTypePk || item.address}`;
    if (seenUids.has(uid)) continue;
    seenUids.add(uid);

    const addr = String(item.address || "").trim();
    const cityName = String(item.cityName || "").trim();
    const city = extractCity(addr, cityName);
    const lat = item.latitude ? parseFloat(String(item.latitude)) : null;
    const lng = item.longitude ? parseFloat(String(item.longitude)) : null;

    allEvents.push({
      id: uid,
      title: String(item.name || "").trim(),
      titleEn: item.name_eng ? String(item.name_eng).trim() : null,
      category: "venue_h",
      categoryLabel: CATEGORY_LABELS.venue_h,
      description: String(item.intro || item.ticketPrice || "").trim(),
      descriptionEn: item.intro_eng ? String(item.intro_eng).trim() : null,
      imageUrl: item.representImage ? String(item.representImage).trim() : null,
      masterUnit: String(item.mainTypeName || item.groupTypeName || "").trim() || null,
      startDate: "",
      endDate: "",
      sourceWebPromote: item.srcWebsite ? String(item.srcWebsite).trim() : (item.facebook ? String(item.facebook).trim() : null),
      webSales: null,
      shows: [
        {
          time: "常態開放",
          location: addr,
          locationName: String(item.name || "").trim(),
          city,
          latitude: lat,
          longitude: lng,
          price: String(item.ticketPrice || "").trim(),
          onSales: "N",
        },
      ],
    });
  }

  const result = {
    ok: true,
    total: allEvents.length,
    updatedAt: new Date().toISOString(),
    events: allEvents,
  };

  const outPath = path.join(ROOT_DIR, "data", "cultural-events-seed.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  console.log(`✓ Saved cultural events seed: ${allEvents.length} items to ${outPath}`);
  return result;
}

async function buildPerformanceVenuesAndPublicArtSeed() {
  console.log("\n=== Building Performance Venues & Merging Public Art Seed ===");
  // 1. Fetch 767 performance venues
  const vUrl = "https://cloud.culture.tw/frontsite/trans/SearchPerformPlaceAction.do?method=doFindPerformPlaceTypeJ";
  const vList = await fetchJsonSafely(vUrl);
  console.log(`- Performance places fetched: ${vList.length} records`);

  const venueItems = [];
  for (const item of vList) {
    const name = String(item.placeName || "").trim();
    const addr = String(item.address || "").trim();
    if (!name) continue;

    const city = extractCity(addr, name) || "臺北市";
    const coords = resolveCoords(addr, city);
    const hash = crypto.createHash("md5").update(`${name}_${addr}`).digest("hex").slice(0, 8);
    const artNo = `VENUE_${name}_${hash}`;

    const venueItem = {
      id: artNo,
      artNo,
      title: name,
      artist: String(item.managerUnit || item.applyUnit || "演藝活動主管機關").trim(),
      dimensions: null,
      material: null,
      city,
      location: addr || name,
      lat: coords.lat,
      lng: coords.lng,
      fieldType: "演藝活動場所",
      description: `【主管機關】${item.managerUnit || "無"}\n【申請單位】${item.applyUnit || "無"}\n【登記方式】${item.register || "現場或線上登記"}`,
      imageUrl: item.imageUrl ? String(item.imageUrl).trim() : null,
      year: null,
      sourceUrl: item.register && item.register.includes("http")
        ? item.register.match(/https?:\/\/[^\s)]+/)?.[0] || null
        : "https://cloud.culture.tw",
      agency: String(item.managerUnit || item.applyUnit || "").trim() || null,
      extraJson: {
        isVenue: true,
        phone: String(item.officePhone || "").trim() || null,
        fax: String(item.fax || "").trim() || null,
        email: String(item.email || "").trim() || null,
        register: String(item.register || "").trim() || null,
        contactor: String(item.contactor || "").trim() || null,
      },
    };
    venueItems.push(venueItem);
  }

  // Save standalone performance venues seed
  const venueSeedPath = path.join(ROOT_DIR, "data", "performance-venues-seed.json");
  fs.writeFileSync(venueSeedPath, JSON.stringify({ ok: true, total: venueItems.length, venues: venueItems }, null, 2), "utf-8");
  console.log(`✓ Saved standalone performance venues seed: ${venueItems.length} items to ${venueSeedPath}`);

  // 2. Load existing public-art.json
  const publicArtPath = path.join(ROOT_DIR, "data", "public-art.json");
  let existingPublicArt = [];
  if (fs.existsSync(publicArtPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(publicArtPath, "utf-8"));
      existingPublicArt = Array.isArray(raw) ? raw : (raw.artworks || []);
    } catch (e) {
      console.warn("Failed to parse existing public-art.json, creating new array");
    }
  }

  // Filter out any previous VENUE_ items to cleanly merge
  const nonVenueArt = existingPublicArt.filter((item) => {
    const artNo = item.artNo || item["作品編號"] || item.id || "";
    return !String(artNo).startsWith("VENUE_") && item.fieldType !== "演藝活動場所";
  });

  console.log(`- Existing pure public art items: ${nonVenueArt.length}`);
  const combinedPublicArt = [...nonVenueArt, ...venueItems];
  fs.writeFileSync(publicArtPath, JSON.stringify(combinedPublicArt, null, 2), "utf-8");
  console.log(`✓ Saved combined public-art.json: ${combinedPublicArt.length} items (Art: ${nonVenueArt.length}, Venues: ${venueItems.length})`);
}

async function main() {
  await buildCulturalEventsSeed();
  await buildPerformanceVenuesAndPublicArtSeed();
  console.log("\nAll cultural & venue seeds generated successfully!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
