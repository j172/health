#!/usr/bin/env node
/**
 * Lightweight test script for verifying TGOS Address Geocoding API connectivity.
 *
 * Usage:
 *   node --env-file=.env scripts/test-tgos-geocode.mjs [address]
 *
 * Example:
 *   node --env-file=.env scripts/test-tgos-geocode.mjs "台北市中正區忠孝東路一段1號"
 */

const address = process.argv[2] || "台北市中正區忠孝東路一段1號";

const appId = process.env.TGOS_APP_ID || process.env.TGOS_APPID;
const apiKey = process.env.TGOS_API_KEY;

if (!appId || !apiKey) {
  console.error("❌ Error: TGOS_APP_ID/TGOS_APPID or TGOS_API_KEY is not set in environment.");
  console.error("Please run with: node --env-file=.env scripts/test-tgos-geocode.mjs");
  process.exit(1);
}

const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 };
function isWithinTaiwanBounds(lat, lng) {
  return lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;
}

async function testTgosGeocode() {
  console.log(`🔍 Testing TGOS Geocoding for address: "${address}"`);
  console.log(`🔐 Credentials: TGOS_APP_ID/TGOS_APPID is configured (${appId.length} chars), TGOS_API_KEY is configured (${apiKey.length} chars)`);

  const params = new URLSearchParams({
    oAPPId: appId,
    oAPIKey: apiKey,
    oAddress: address,
    oSRS: "EPSG:4326",
    oFuzzyType: "0",
    oResultDataType: "JSON",
    oFuzzyBuffer: "0",
    oIsOnlyFullMatch: "false",
    oIsLockCounty: "false",
    oIsLockTown: "false",
    oIsLockVillage: "false",
    oIsLockRoadSection: "false",
    oIsLockLane: "false",
    oIsLockAlley: "false",
    oIsLockArea: "false",
    oIsSameNumber_SubNumber: "true",
    oCanIgnoreVillage: "true",
    oCanIgnoreNeighborhood: "true",
    oReturnMaxCount: "1",
  });

  const url = `https://addr.tgos.tw/addrws/v30/QueryAddr.asmx/QueryAddr?${params.toString()}`;

  const startTime = Date.now();
  let status;
  let text;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HealthTW/1.0",
      },
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    console.error(`❌ Network request failed: ${err.message}`);
    process.exit(1);
  }

  const durationMs = Date.now() - startTime;
  console.log(`⏱️ Response received in ${durationMs}ms (HTTP ${status})`);

  if (status !== 200) {
    console.error(`❌ HTTP error ${status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  if (text.includes("額度已滿") || (text.includes("超過") && (text.includes("次數") || text.includes("上限")))) {
    console.error(`⚠️ Quota exceeded message detected: ${text.slice(0, 200)}`);
    process.exit(1);
  }

  // If response is wrapped in XML <string xmlns="http://tempuri.org/">...</string>, extract inner JSON
  let jsonString = text.trim();
  const xmlMatch = jsonString.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
  if (xmlMatch) {
    jsonString = xmlMatch[1].trim();
  }

  if (jsonString.startsWith("認證授權失敗") || jsonString.startsWith("錯誤") || jsonString.startsWith("缺少參數")) {
    console.error(`\n⚠️ TGOS API 回傳驗證或授權錯誤訊息：\n   ${jsonString}`);
    if (jsonString.includes("IP不正確")) {
      console.log("\n💡 原因說明：");
      console.log("   TGOS 服務預設會綁定申請時填寫的伺服器 IP 白名單或網域。");
      console.log("   當前呼叫來源 IP 尚未加入 TGOS 平台的白名單，因此被 TGOS 拒絕。");
      console.log("   - 在本機測試時：可至 TGOS 會員中心將此對外 IP 加入白名單。");
      console.log("   - 在生產環境中：只要伺服器 IP 符合申請資料即可正常呼叫。");
      console.log("   - 容錯機制：系統運行時此錯誤會被妥善封裝為 kind: 'error'，並自動 fallback 至 OpenCage / Nominatim，保證服務不中斷！\n");
    }
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    console.error(`❌ Failed to parse response as JSON: ${err.message}`);
    console.error(`Raw response snippet: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  const list = Array.isArray(data) ? data : data.AddressList;
  if (!list || list.length === 0) {
    console.warn("⚠️ No address matches found in TGOS response.");
    if (data.Info) {
      console.log("Info details:", JSON.stringify(data.Info, null, 2));
    }
    process.exit(0);
  }

  const first = list[0];
  const lat = typeof first.Y === "number" ? first.Y : parseFloat(first.Y);
  const lng = typeof first.X === "number" ? first.X : parseFloat(first.X);

  console.log("✅ TGOS Geocoding Successful!");
  console.log(`📍 Full Address: ${first.FULL_ADDR || "N/A"}`);
  console.log(`🌐 Coordinates: Lat ${lat}, Lng ${lng}`);
  console.log(`🗺️ Within Taiwan Bounds: ${isWithinTaiwanBounds(lat, lng) ? "Yes ✅" : "No ❌"}`);

  if (list.length > 1) {
    console.log(`ℹ️ Total candidate matches returned: ${list.length}`);
  }
}

testTgosGeocode().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
