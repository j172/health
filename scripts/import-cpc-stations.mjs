import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const ENDPOINTS = [
  {
    key: "inflation",
    serviceName: "輪胎充氣",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/inflationstn.asmx/getinflationstnData_XML",
  },
  {
    key: "electricMotoCharging",
    serviceName: "電動機車充電",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/ElectricMotorcycleChargingStn",
  },
  {
    key: "electricMotoSwapping",
    serviceName: "電動機車換電",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/ElectricMotorcycleBatterySwappingStn",
  },
  {
    key: "electricMotoBoth",
    serviceName: "電動機車充換電",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/electricmotoData",
  },
  {
    key: "evCarCharging",
    serviceName: "汽車充電",
    type: "csv",
    url: "https://www3.cpc.com.tw/opendata_d00/%E5%8F%B0%E7%81%A3%E4%B8%AD%E6%B2%B9%E8%82%A1%E4%BB%BD%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8_%E6%8F%90%E4%BE%9B%E9%9B%BB%E5%8B%95%E8%BB%8A%E5%85%85%E9%9B%BB%E6%9C%8D%E5%8B%99%E5%8A%A0%E6%B2%B9%E7%AB%99.csv",
  },
  {
    key: "fiveTypeService",
    serviceName: "五合一複合服務",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/5typeservicestn",
  },
  {
    key: "leasedCharging",
    serviceName: "外租快充樁",
    type: "csv",
    url: "https://www3.cpc.com.tw/opendata_d00/%E5%8F%B0%E7%81%A3%E4%B8%AD%E6%B2%B9%E8%82%A1%E4%BB%BD%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8_%E5%9C%9F%E5%9C%B0%E5%87%BA%E7%A7%9F%E7%B5%A6%E5%85%85%E9%9B%BB%E6%A8%81%E6%A5%AD%E8%80%85%E7%87%9F%E9%81%8B%E5%8A%A0%E6%B2%B9%E7%AB%99.csv",
  },
  {
    key: "washService",
    serviceName: "洗車服務",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/stnwithwashservice.asmx/getwashservicedata_XML",
  },
  {
    key: "cupGo",
    serviceName: "Cup Go 咖啡",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/cupgo.asmx/getcupgoData_XML",
  },
  {
    key: "electronicInflation",
    serviceName: "數位電子打氣機",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/Electronicinflation.asmx/getElectronicinflationData_XML",
  },
  {
    key: "addWater",
    serviceName: "加水服務",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/addwaterstn.asmx/getaddwaterstnData_XML",
  },
  {
    key: "collectParkingFee",
    serviceName: "代收停車費",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/collectparkingfee.asmx/getcollectparkingfeeData_XML",
  },
  {
    key: "suctionMachine",
    serviceName: "吸塵器",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/SuctionMachineStn",
  },
  {
    key: "oilRecycle",
    serviceName: "廢機油回收",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/OilRecycleStn",
  },
  {
    key: "etag",
    serviceName: "eTag 服務",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/etag.asmx/getetagData_XML",
  },
  {
    key: "accessibleToilets",
    serviceName: "無障礙廁所",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/Accessibletoilets.asmx/getAccessibletoiletsData_XML",
  },
  {
    key: "varietyShop",
    serviceName: "複合商店",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/VarietyShopStn",
  },
  {
    key: "selfServeDiesel",
    serviceName: "自助柴油",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/SelfServeDieselStn",
  },
  {
    key: "selfServeGasoline",
    serviceName: "自助汽油",
    type: "json",
    url: "https://vipmbr.cpc.com.tw/openData/SelfServeGasolineStn",
  },
  {
    key: "ipassCard",
    serviceName: "一卡通",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/ipassCard.asmx/getipassCardData_XML",
  },
  {
    key: "easyCard",
    serviceName: "悠遊卡",
    type: "xml",
    url: "https://vipmbr.cpc.com.tw/CPCSTN/EasyCard.asmx/getEasyCardData_XML",
  },
];

// 站點基本資料補充來源：油品種類、付款方式、總營業時間、洗車類別。
// 注意：這個端點同時回傳「自營站/漁船站」（站代號 5 碼，如 D2030，跟既有 20 大服務端點格式一致）
// 與「加盟站」（站代號 9 碼，如 AA6212A03，既有站點清單中從未出現過的全新命名空間）。
// 本次擴充僅補強既有站點清單中「已存在」的站點資料，不會因為這個來源而新增「加盟站」站點，
// 以維持既有站點範疇（詳見 docs/specs/cpc-station-info-enrichment.md）。
const STATION_INFO_URL = "https://vipmbr.cpc.com.tw/openData/getStationInfo";

function toBool(val) {
  return val === 1 || val === "1" || val === true;
}

async function mergeStationInfo(stationsMap) {
  console.log("-> 正在抓取 [站點基本資料：油品種類/付款方式/總營業時間] (JSON)...");
  const text = await fetchWithTimeout(STATION_INFO_URL);
  const rawList = JSON.parse(text);

  let matched = 0;
  let skippedNoMatch = 0;
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const code = String(item["站代號"] || "").trim();
    if (!code) continue;

    const station = stationsMap.get(code);
    if (!station) {
      // 既有站點清單以外的站代號（多為加盟站的 9 碼代號，或既有服務端點未涵蓋到的站點）
      // 暫不視為既有站點資料缺口，故不建立新站點。
      skippedNoMatch++;
      continue;
    }

    station.fuelTypes = {
      unleaded92: toBool(item["無鉛92"]),
      unleaded95: toBool(item["無鉛95"]),
      unleaded98: toBool(item["無鉛98"]),
      alcoholGasoline: toBool(item["酒精汽油"]),
      kerosene: toBool(item["煤油"]),
      superDiesel: toBool(item["超柴"]),
    };
    station.paymentMethods = {
      memberCard: toBool(item["會員卡"]),
      selfServiceCard: toBool(item["刷卡自助"]),
      eInvoice: toBool(item["電子發票"]),
      easyCard: toBool(item["悠遊卡"]),
      iPassCard: toBool(item["一卡通"]),
      happyCash: toBool(item["HappyCash"]),
      selfServeDieselStation: toBool(item["自助柴油站"]),
    };

    const businessHours = String(item["營業時間"] || "").trim();
    if (businessHours) station.businessHours = businessHours;

    const washCategory = String(item["洗車類別"] || "").trim();
    if (washCategory) station.washCategory = washCategory;

    matched++;
  }

  console.log(
    `   ✓ 成功合併 [站點基本資料]: ${matched} 筆既有站點補上油品/付款方式/營業時間資料（另有 ${skippedNoMatch} 筆站代號不在既有站點清單中，暫不建立新站點）`
  );
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "curl/7.88.1",
        Accept: "*/*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim().replace(/^"/, "").replace(/"$/, ""));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

function formatStationName(raw) {
  if (!raw) return "中油加油站";
  let s = String(raw).trim();
  if (!s.startsWith("中油") && !s.includes("台灣中油")) {
    s = `中油${s}`;
  }
  return s;
}

function parseCoord(val) {
  if (!val) return null;
  const num = parseFloat(String(val).trim());
  if (isNaN(num) || num === 0) return null;
  return Math.round(num * 1000000) / 1000000;
}

async function main() {
  console.log("開始抓取台灣中油 20 大加油站服務據點資料集並進行站點聚合...");
  const stationsMap = new Map();

  for (const ep of ENDPOINTS) {
    try {
      console.log(`-> 正在抓取 [${ep.serviceName}] (${ep.type.toUpperCase()})...`);
      const text = await fetchWithTimeout(ep.url);
      let rawList = [];

      if (ep.type === "json") {
        rawList = JSON.parse(text);
      } else if (ep.type === "xml") {
        const parser = new XMLParser();
        const parsed = parser.parse(text);
        const tables = parsed?.Dataset?.Table || [];
        rawList = Array.isArray(tables) ? tables : [tables];
      } else if (ep.type === "csv") {
        rawList = parseCsv(text);
      }

      let count = 0;
      for (const item of rawList) {
        if (!item || typeof item !== "object") continue;

        const code = String(
          item["站代號"] || item["站號"] || item["加油站代號"] || item["StationID"] || ""
        ).trim();
        if (!code) continue;

        const nameRaw = String(item["站名"] || item["加油站名稱"] || item["StationName"] || "").trim();
        const postalCode = String(item["郵遞區號"] || item["ZipCode"] || "").trim();
        const address = String(item["地址"] || item["Address"] || "").trim();
        const phone = String(item["電話"] || item["Phone"] || "").trim();
        const lat = parseCoord(item["緯度"] || item["Latitude"] || item["lat"]);
        const lng = parseCoord(item["經度"] || item["Longitude"] || item["lng"]);
        const serviceTime = String(item["提供服務時段"] || item["服務時間"] || item["營業時間"] || "").trim();
        const landArea = String(item["土地面積_平方公尺"] || "").trim();

        let station = stationsMap.get(code);
        if (!station) {
          station = {
            stationCode: code,
            name: formatStationName(nameRaw),
            postalCode,
            address,
            phone,
            lat,
            lng,
            services: new Set(),
            serviceHours: {},
            landArea,
          };
          stationsMap.set(code, station);
        } else {
          // Merge metadata
          if (!station.address && address) station.address = address;
          if (!station.phone && phone) station.phone = phone;
          if (!station.postalCode && postalCode) station.postalCode = postalCode;
          if ((!station.lat || !station.lng) && lat && lng) {
            station.lat = lat;
            station.lng = lng;
          }
          if (!station.landArea && landArea) station.landArea = landArea;
        }

        station.services.add(ep.serviceName);
        if (serviceTime) {
          station.serviceHours[ep.serviceName] = serviceTime;
        }
        count++;
      }
      console.log(`   ✓ 成功整合 [${ep.serviceName}]: ${count} 筆站點服務`);
    } catch (err) {
      console.warn(`   ✗ 抓取 [${ep.serviceName}] 失敗:`, err.message);
    }
  }

  console.log(`\n聚合完成！全台共收錄 ${stationsMap.size} 座台灣中油加油站據點。`);

  try {
    await mergeStationInfo(stationsMap);
  } catch (err) {
    console.warn("   ✗ 抓取 [站點基本資料：油品種類/付款方式/總營業時間] 失敗:", err.message);
  }

  // Transform into Facility structure
  const facilityItems = [];
  let seqId = 1;
  for (const [code, st] of stationsMap.entries()) {
    const serviceList = Array.from(st.services);
    const serviceItemStr = serviceList.join(", ");

    facilityItems.push({
      id: seqId++,
      name: st.name,
      address: st.address || null,
      phone: st.phone || null,
      lat: st.lat,
      lng: st.lng,
      service_item: serviceItemStr,
      extra_json: {
        stationCode: code,
        postalCode: st.postalCode || "",
        services: serviceList,
        serviceHours: st.serviceHours,
        landArea: st.landArea || "",
        dataOrg: "台灣中油股份有限公司",
        ...(st.fuelTypes ? { fuelTypes: st.fuelTypes } : {}),
        ...(st.paymentMethods ? { paymentMethods: st.paymentMethods } : {}),
        ...(st.businessHours ? { businessHours: st.businessHours } : {}),
        ...(st.washCategory ? { washCategory: st.washCategory } : {}),
      },
    });
  }

  // Sort by stationCode
  facilityItems.sort((a, b) => (a.extra_json.stationCode > b.extra_json.stationCode ? 1 : -1));

  // Write to data/facilities-seeds/cpc_gas_station.json
  const seedDir = path.resolve(process.cwd(), "data/facilities-seeds");
  if (!fs.existsSync(seedDir)) {
    fs.mkdirSync(seedDir, { recursive: true });
  }
  const seedPath = path.resolve(seedDir, "cpc_gas_station.json");
  fs.writeFileSync(seedPath, JSON.stringify(facilityItems, null, 2), "utf8");
  console.log(`已成功寫入聚合種子檔案: ${seedPath} (共 ${facilityItems.length} 座加油站)`);

  // Try DB upsert
  try {
    const mysqlModule = await import("../lib/server/db/mysql.ts");
    if (mysqlModule?.withConnection) {
      await mysqlModule.withConnection(async (conn) => {
        console.log("正在將聚合站點寫入 MySQL facilities 資料表 (facility_type = 'cpc_gas_station')...");
        const now = new Date();
        let upserted = 0;
        for (const item of facilityItems) {
          await conn.query(
            `INSERT INTO facilities (
              facility_type, source_key, source_id, name, address, phone,
              lat, lng, service_item, service_time, data_org, extra_json,
              synced_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              name = VALUES(name),
              address = VALUES(address),
              phone = VALUES(phone),
              lat = VALUES(lat),
              lng = VALUES(lng),
              service_item = VALUES(service_item),
              extra_json = VALUES(extra_json),
              synced_at = VALUES(synced_at),
              updated_at = VALUES(updated_at)`,
            [
              "cpc_gas_station",
              "cpc_stations",
              item.extra_json.stationCode,
              item.name,
              item.address,
              item.phone,
              item.lat,
              item.lng,
              item.service_item,
              "依各站公告",
              "台灣中油股份有限公司",
              JSON.stringify(item.extra_json),
              now,
              now,
              now,
            ]
          );
          upserted++;
        }
        console.log(`成功同步 ${upserted} 筆中油加油站至 MySQL facilities 表！`);
      });
    }
  } catch (dbErr) {
    console.warn("資料庫寫入略過（連線或環境未就緒）:", dbErr.message);
  }

  console.log("中油加油站 20 大服務資料聚合流程順利完成！");
}

main().catch((err) => {
  console.error("執行 import-cpc-stations 發生錯誤:", err);
  process.exit(1);
});
