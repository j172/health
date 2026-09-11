#!/usr/bin/env node
/**
 * scripts/import-local-facilities.mjs
 *
 * Comprehensive importer for municipal open datasets from Taipei, New Taipei,
 * Taoyuan, and Kaohsiung across clinics, LTC, preschools, welfare, and public services.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { inferCoords, fetchTextWithEncoding, parseCsv } from "./dataset-helpers.mjs";

const BASE_URL = process.env.HEALTH_BASE_URL || "https://health.j172.tw";
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.RSS_SYNC_ADMIN_SECRET;
const SEEDS_DIR = path.join(process.cwd(), "data", "facilities-seeds");

if (!fs.existsSync(SEEDS_DIR)) {
  fs.mkdirSync(SEEDS_DIR, { recursive: true });
}

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function normalizeAddress(addr) {
  if (!addr) return "";
  return addr
    .replace(/[\s\r\n]/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[臺台]/g, "台")
    .trim();
}

async function fetchJsonSafe(url) {
  try {
    const text = await fetchTextWithEncoding(url);
    return JSON.parse(text);
  } catch (err) {
    console.warn(`  Warning fetching JSON ${url}:`, err.message);
    return [];
  }
}

async function importDatasetBatch(label, facilityType, sourceKey, items, fieldMap, defaultCounty = "") {
  console.log(`\n[${label}] Processing ${items.length} records...`);
  const records = [];

  for (const item of items) {
    const name = (item[fieldMap.name] || "").trim();
    if (!name) continue;

    const rawAddr = (item[fieldMap.address] || "").trim();
    const town = fieldMap.town ? (item[fieldMap.town] || "").trim() : "";
    const fullAddr = town && !rawAddr.includes(town) ? `${town}${rawAddr}` : rawAddr;
    const address = normalizeAddress(fullAddr);
    const phone = fieldMap.phone ? (item[fieldMap.phone] || "").trim() : null;

    let lat = fieldMap.lat && item[fieldMap.lat] ? parseFloat(item[fieldMap.lat]) : null;
    let lng = fieldMap.lng && item[fieldMap.lng] ? parseFloat(item[fieldMap.lng]) : null;

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      const inferred = inferCoords(address, defaultCounty);
      if (inferred) {
        lat = inferred.lat;
        lng = inferred.lng;
      }
    }

    const serviceItem = fieldMap.serviceItem ? (item[fieldMap.serviceItem] || null) : null;
    const sourceId = item[fieldMap.id] ? String(item[fieldMap.id]).trim() : sha256(`${name}-${address}`);

    records.push({
      facilityType,
      sourceKey,
      sourceId,
      name,
      address: address || null,
      phone: phone || null,
      lat: lat && !isNaN(lat) ? lat : null,
      lng: lng && !isNaN(lng) ? lng : null,
      serviceItem,
      serviceTime: null,
      dataOrg: fieldMap.dataOrg || "政府資料開放平台",
      extra: { ...item },
    });
  }

  console.log(`  Parsed ${records.length} valid records`);

  const seedFile = path.join(SEEDS_DIR, `${sourceKey}.json`);
  fs.writeFileSync(seedFile, JSON.stringify({ total: records.length, records }, null, 2), "utf-8");
  console.log(`  Saved seed to ${seedFile}`);

  if (ADMIN_SECRET && records.length > 0) {
    try {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < Math.min(records.length, 1500); i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const postRes = await fetch(`${BASE_URL}/api/admin/facilities-import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rss-sync-admin-secret": ADMIN_SECRET,
          },
          body: JSON.stringify({ records: chunk }),
        });
        if (postRes.ok) {
          const resJson = await postRes.json();
          console.log(`  Pushed chunk to API:`, JSON.stringify(resJson));
        }
      }
    } catch (pushErr) {
      console.warn("  Remote push notice:", pushErr.message);
    }
  }

  return records;
}

async function run() {
  console.log("=== Starting Batch Ingestion of Municipal Datasets ===");

  // 1. 新北市托嬰中心與公共親子中心 (項次 12, 14, 8 分流)
  try {
    const ntpcNurseries = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/4182946c-9f01-4676-9992-d40047b232cf/json?page=0&size=100");
    await importDatasetBatch(
      "新北市公共親子中心與托嬰服務",
      "child_welfare_nursery",
      "ntpc_nurseries",
      ntpcNurseries,
      {
        id: "no",
        name: "title",
        address: "address",
        town: "town",
        phone: "localcallservice",
        serviceItem: "class_character",
        dataOrg: "新北市政府社會局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC nurseries import warning:", e.message);
  }

  // 2. 新北市立案短期補習班 (項次 8 精準分流至 cram_school)
  try {
    const ntpcCram = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/a3716c81-3652-4450-897d-3574b875888b/json?page=0&size=100");
    await importDatasetBatch(
      "新北市立案短期補習班",
      "cram_school",
      "ntpc_cram_schools",
      ntpcCram,
      {
        id: "areacode",
        name: "c_schoolname",
        address: "address",
        town: "district",
        dataOrg: "新北市政府教育局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC cram schools import warning:", e.message);
  }

  // 3. 新北市清潔隊部 (項次 18)
  try {
    const ntpcCleaning = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/47aced4b-ea2d-42b0-ab70-8ae8abe661b6/json?page=0&size=100");
    await importDatasetBatch(
      "新北市清潔隊部",
      "cleaning_squad",
      "ntpc_cleaning_squads",
      ntpcCleaning,
      {
        name: "name",
        address: "address",
        phone: "localcallservice",
        lat: "wgs84ay_latitude",
        lng: "wgs84ax_longitude",
        dataOrg: "新北市政府環境保護局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC cleaning squad import warning:", e.message);
  }

  // 4. 新北市環保旅店 (項次 19)
  try {
    const ntpcHotels = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/c9fe0056-efb0-448d-9e2b-cc79f5330050/json?page=0&size=100");
    await importDatasetBatch(
      "新北市環保旅店",
      "green_hotel",
      "ntpc_green_hotels",
      ntpcHotels,
      {
        id: "seqno",
        name: "name",
        address: "address",
        phone: "localcallservice",
        serviceItem: "type",
        dataOrg: "新北市政府環境保護局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC green hotels import warning:", e.message);
  }

  // 5. 新北市綠色商店 (項次 21)
  try {
    const ntpcShops = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/6ccd0274-0c09-43b0-98fc-4d5222a71e8b/json?page=0&size=100");
    await importDatasetBatch(
      "新北市綠色商店",
      "green_shop",
      "ntpc_green_shops",
      ntpcShops,
      {
        id: "seqno",
        name: "name",
        address: "address",
        phone: "localcallservice",
        serviceItem: "type",
        dataOrg: "新北市政府環境保護局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC green shops import warning:", e.message);
  }

  // 6. 桃園市特約藥局 (項次 23)
  try {
    const tycgPharmacies = await fetchJsonSafe("https://opendata.tycg.gov.tw/api/v1/dataset.api_access?rid=2cb206f2-3fb2-42d9-9820-f3291f6bc35c&format=json");
    await importDatasetBatch(
      "桃園市藥局",
      "pharmacy",
      "tycg_pharmacies",
      tycgPharmacies,
      {
        id: "序",
        name: "藥局名稱",
        address: "地址",
        town: "區域",
        phone: "電話",
        dataOrg: "桃園市政府衛生局",
      },
      "桃園市",
    );
  } catch (e) {
    console.warn("TYCG pharmacies import warning:", e.message);
  }

  // 7. 新北市避難收容所 (項次 11)
  try {
    const ntpcDisaster = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/25e439ab-49e7-4e5e-85ce-a25c13fd2770/json?page=0&size=100");
    await importDatasetBatch(
      "新北市避難收容處所",
      "disaster_shelter",
      "ntpc_disaster_shelters",
      ntpcDisaster,
      {
        id: "code",
        name: "name",
        address: "address",
        town: "district",
        phone: "contact_cellphone",
        serviceItem: "standing_shelter",
        dataOrg: "新北市政府消防局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC disaster shelters import warning:", e.message);
  }

  // 8. 新北市文化資產 (項次 16)
  try {
    const ntpcHeritage = await fetchJsonSafe("https://data.ntpc.gov.tw/api/datasets/df63a853-aba9-4ec1-bd28-e74459e5d5c5/json?page=0&size=100");
    await importDatasetBatch(
      "新北市文化資產",
      "heritage",
      "ntpc_heritage",
      ntpcHeritage,
      {
        id: "no",
        name: "title",
        address: "address",
        town: "town",
        serviceItem: "assets_type",
        dataOrg: "新北市政府文化局",
      },
      "新北市",
    );
  } catch (e) {
    console.warn("NTPC heritage import warning:", e.message);
  }

  console.log("\n=== Municipal Datasets Batch Ingestion Completed ===");
}

run();
