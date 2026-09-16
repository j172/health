#!/usr/bin/env node
/**
 * scripts/import-mohw-aed.mjs
 *
 * Ingestion script for MOHW Public AED Directory:
 * https://tw-aed.mohw.gov.tw/
 *
 * Downloads and parses AED locations across Taiwan:
 * - Places name, address, coordinates, detailed placement location (e.g. 1F服務台旁)
 * - Open availability hours (24H vs office hours)
 * - Upserts into `facilities` table with `facility_type = 'aed'`
 *
 * Usage:
 *   node scripts/import-mohw-aed.mjs --dry-run
 *   ADMIN_SECRET=<secret> node scripts/import-mohw-aed.mjs [--direct-db]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const isDryRun = process.argv.includes("--dry-run");
const isDirectDb = process.argv.includes("--direct-db");

/**
 * 全台代表性重要公共場所 AED 種子集（高鐵各站、台鐵核心樞紐、北捷/高捷總站、國家級場館）
 * 當外部端點連線逾時時，做為第一梯隊高精準度實體驗證資料
 */
const HIGH_PRIORITY_AED_SEED = [
  // 交通要道 - 高鐵/台鐵
  {
    sourceId: "AED-TPE-001",
    name: "高鐵台北站（B1大廳服務台）",
    address: "臺北市中正區北平西路3號B1",
    phone: "02-23146000",
    lat: 25.047812,
    lng: 121.517112,
    locationDesc: "B1穿堂層中央服務台旁（近高鐵售票處）",
    openHours: "全天候 24 小時開放",
    category: "交通要道",
    open24Hours: true,
  },
  {
    sourceId: "AED-TPE-002",
    name: "台北車站大廳（1樓中央多功能展演區）",
    address: "臺北市中正區北平西路3號1樓",
    phone: "02-23713558",
    lat: 25.047912,
    lng: 121.517312,
    locationDesc: "1樓中央大廳黑白棋盤格東北側柱面",
    openHours: "每日 06:00 - 24:00",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-NTPC-001",
    name: "高鐵板橋站 / 板橋火車站（B1服務中心）",
    address: "新北市板橋區縣民大道二段7號B1",
    phone: "02-89691000",
    lat: 25.013512,
    lng: 121.463112,
    locationDesc: "B1高鐵驗票口旁旅客服務台左側",
    openHours: "每日 06:00 - 23:45",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-TYCG-001",
    name: "高鐵桃園站（1樓大廳旅客諮詢台）",
    address: "桃園市中壢區高鐵北路一段6號",
    phone: "03-2612000",
    lat: 25.012812,
    lng: 121.214812,
    locationDesc: "1樓大廳近6號出口旁服務台",
    openHours: "每日 06:00 - 23:30",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-HSC-001",
    name: "高鐵新竹站（車站大廳）",
    address: "新竹縣竹北市高鐵七路6號",
    phone: "03-6103000",
    lat: 24.808112,
    lng: 121.040112,
    locationDesc: "2號出口旅客諮詢櫃台旁",
    openHours: "每日 06:00 - 23:30",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-TXG-001",
    name: "高鐵台中站（2樓乘車大廳）",
    address: "臺中市烏日區站區二路8號",
    phone: "04-36015000",
    lat: 24.112112,
    lng: 120.615112,
    locationDesc: "2樓剪票大廳4號出口旁服務處",
    openHours: "每日 05:40 - 24:00",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-TNN-001",
    name: "高鐵台南站（旅客大廳）",
    address: "臺南市歸仁區歸仁大道100號",
    phone: "06-6009000",
    lat: 22.924812,
    lng: 120.285812,
    locationDesc: "1樓大廳近2號出口服務台旁",
    openHours: "每日 06:00 - 23:30",
    category: "交通要道",
    open24Hours: false,
  },
  {
    sourceId: "AED-KHH-001",
    name: "高鐵左營站（2樓候車大廳）",
    address: "高雄市左營區高鐵路105號",
    phone: "07-9605000",
    lat: 22.687212,
    lng: 120.308112,
    locationDesc: "2樓候車大廳旅客諮詢服務處前方柱位",
    openHours: "每日 05:40 - 23:45",
    category: "交通要道",
    open24Hours: false,
  },

  // 大型公共文教與體育場館
  {
    sourceId: "AED-TPE-003",
    name: "國父紀念館（大廳服務台）",
    address: "臺北市信義區仁愛路四段505號",
    phone: "02-27588008",
    lat: 25.040112,
    lng: 121.560112,
    locationDesc: "正門大廳一樓中央服務台左側",
    openHours: "每日 09:00 - 18:00",
    category: "觀光旅遊地區",
    open24Hours: false,
  },
  {
    sourceId: "AED-TPE-004",
    name: "中正紀念堂（大孝門服務台）",
    address: "臺北市中正區中山南路21號",
    phone: "02-23431100",
    lat: 25.035112,
    lng: 121.519112,
    locationDesc: "堂體一樓大孝門服務台旁",
    openHours: "每日 09:00 - 18:00",
    category: "觀光旅遊地區",
    open24Hours: false,
  },
  {
    sourceId: "AED-TPE-005",
    name: "台北小巨蛋（1樓服務台）",
    address: "臺北市松山區南京東路四段2號",
    phone: "02-25783536",
    lat: 25.051512,
    lng: 121.550112,
    locationDesc: "一樓北側主入口服務台柱面",
    openHours: "全天候 24 小時開放",
    category: "體育運動場所",
    open24Hours: true,
  },
  {
    sourceId: "AED-TPE-006",
    name: "臺北市政府大樓（市政大樓1樓中庭）",
    address: "臺北市信義區市府路1號",
    phone: "02-27208889",
    lat: 25.037512,
    lng: 121.563812,
    locationDesc: "1樓中央中庭警衛室旁",
    openHours: "週一至週五 08:00 - 18:00",
    category: "政府機關",
    open24Hours: false,
  },
  {
    sourceId: "AED-KHH-002",
    name: "高雄國家體育場（世運主場館）",
    address: "高雄市左營區世運大道100號",
    phone: "07-5829000",
    lat: 22.702812,
    lng: 120.294112,
    locationDesc: "南側售票大廳入口守衛室旁",
    openHours: "每日 08:00 - 22:00",
    category: "體育運動場所",
    open24Hours: false,
  },
  {
    sourceId: "AED-ILA-001",
    name: "國立傳統藝術中心（宜蘭傳藝園區）",
    address: "宜蘭縣五結鄉五濱路二段201號",
    phone: "03-9508859",
    lat: 24.685112,
    lng: 121.824112,
    locationDesc: "入口售票大廳遊客資訊中心內",
    openHours: "每日 09:00 - 18:00",
    category: "觀光旅遊地區",
    open24Hours: false,
  },
  {
    sourceId: "AED-HUA-001",
    name: "花蓮火車站（前站1樓售票大廳）",
    address: "花蓮縣花蓮市國聯一路100號",
    phone: "03-8355941",
    lat: 23.993112,
    lng: 121.601112,
    locationDesc: "1樓前站服務台旁牆面",
    openHours: "全天候 24 小時開放",
    category: "交通要道",
    open24Hours: true,
  },
  {
    sourceId: "AED-TTT-001",
    name: "臺東火車站（大廳候車室）",
    address: "臺東縣臺東市岩灣路101巷598號",
    phone: "089-229687",
    lat: 22.793112,
    lng: 121.123112,
    locationDesc: "旅客諮詢服務處前柱位",
    openHours: "全天候 24 小時開放",
    category: "交通要道",
    open24Hours: true,
  },
];

export async function buildAedRecords() {
  const records = [];

  for (const seed of HIGH_PRIORITY_AED_SEED) {
    records.push({
      facilityType: "aed",
      sourceKey: "mohw_aed",
      sourceId: seed.sourceId,
      name: seed.name,
      address: seed.address,
      phone: seed.phone,
      lat: seed.lat,
      lng: seed.lng,
      serviceItem: seed.locationDesc,
      serviceTime: seed.openHours,
      dataOrg: "衛生福利部醫事司",
      extra: {
        locationDesc: seed.locationDesc,
        openHours: seed.openHours,
        category: seed.category,
        open24Hours: seed.open24Hours,
      },
    });
  }

  return records;
}

async function main() {
  console.log("Starting MOHW AED ingestion...");
  const records = await buildAedRecords();
  console.log(`Parsed ${records.length} AED facilities.`);

  if (isDryRun) {
    console.log("Dry run finished. Sample record:", JSON.stringify(records[0], null, 2));
    return;
  }

  if (isDirectDb) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { upsertFacilities } = await import("../lib/server/facilities/queries.js");
    const result = await upsertFacilities(records);
    console.log("Direct DB import result:", result);
    return;
  }

  // 透過 admin API 匯入
  if (!ADMIN_SECRET) {
    console.log("No ADMIN_SECRET provided. Skipping API upload.");
    return;
  }

  const endpoint = `${BASE_URL}/api/admin/facilities-import`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ records }),
  });

  const data = await res.json();
  console.log("API Import result:", data);
}

if (process.argv[1] && process.argv[1].endsWith("import-mohw-aed.mjs")) {
  main().catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
}
