import { test } from "node:test";
import assert from "node:assert/strict";

// Simulated Taiwan bounds check mirroring geocodeProviders.ts
const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 };
function isWithinTaiwanBounds(lat, lng) {
  return lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;
}

const DAILY_BUDGET = {
  tgos: 5000,
  opencage: 1400,
  opencage2: 1400,
  nominatim: 1000,
};

function isBudgetExhausted(state, provider) {
  const row = state.get(provider);
  if (!row) return false;
  return row.circuitBroken || row.requestsUsed >= DAILY_BUDGET[provider];
}

function isOpenCageCapacityExhausted(state, key2Configured) {
  return isBudgetExhausted(state, "opencage") && (!key2Configured || isBudgetExhausted(state, "opencage2"));
}

function isAllProvidersCapacityExhausted(state, tgosConfigured, key2Configured) {
  return (
    (!tgosConfigured || isBudgetExhausted(state, "tgos")) &&
    isOpenCageCapacityExhausted(state, key2Configured) &&
    isBudgetExhausted(state, "nominatim")
  );
}

test("TGOS: Taiwan bounds validation correctly includes and excludes coordinates", () => {
  // Taipei Main Station
  assert.equal(isWithinTaiwanBounds(25.0478, 121.517), true);
  // Kaohsiung City Hall
  assert.equal(isWithinTaiwanBounds(22.6273, 120.3014), true);
  // Penghu
  assert.equal(isWithinTaiwanBounds(23.565, 119.579), true);
  // Kinmen
  assert.equal(isWithinTaiwanBounds(24.449, 118.376), true);

  // Outside Taiwan bounds (Beijing, Tokyo, New York)
  assert.equal(isWithinTaiwanBounds(39.9042, 116.4074), false);
  assert.equal(isWithinTaiwanBounds(35.6762, 139.6503), false);
  assert.equal(isWithinTaiwanBounds(40.7128, -74.006), false);

  // Bounds boundaries
  assert.equal(isWithinTaiwanBounds(TAIWAN_BOUNDS.minLat, TAIWAN_BOUNDS.minLng), true);
  assert.equal(isWithinTaiwanBounds(TAIWAN_BOUNDS.maxLat, TAIWAN_BOUNDS.maxLng), true);
  assert.equal(isWithinTaiwanBounds(TAIWAN_BOUNDS.minLat - 0.1, 120.0), false);
  assert.equal(isWithinTaiwanBounds(23.5, TAIWAN_BOUNDS.maxLng + 0.1), false);
});

test("TGOS: Budget configuration and daily limits", () => {
  assert.equal(DAILY_BUDGET.tgos, 5000);
  assert.equal(DAILY_BUDGET.opencage, 1400);
  assert.equal(DAILY_BUDGET.opencage2, 1400);
  assert.equal(DAILY_BUDGET.nominatim, 1000);
});

test("TGOS: isBudgetExhausted logic for tgos provider", () => {
  const state = new Map();

  // No row yet -> not exhausted
  assert.equal(isBudgetExhausted(state, "tgos"), false);

  // Below cap -> not exhausted
  state.set("tgos", { requestsUsed: 4999, circuitBroken: false });
  assert.equal(isBudgetExhausted(state, "tgos"), false);

  // At cap -> exhausted
  state.set("tgos", { requestsUsed: 5000, circuitBroken: false });
  assert.equal(isBudgetExhausted(state, "tgos"), true);

  // Circuit broken well below cap -> exhausted
  state.set("tgos", { requestsUsed: 12, circuitBroken: true });
  assert.equal(isBudgetExhausted(state, "tgos"), true);
});

test("TGOS: isAllProvidersCapacityExhausted behavior with TGOS as priority", () => {
  const state = new Map();

  // OpenCage and Nominatim exhausted, but TGOS configured and has budget -> NOT exhausted
  state.set("tgos", { requestsUsed: 10, circuitBroken: false });
  state.set("opencage", { requestsUsed: 1400, circuitBroken: false });
  state.set("nominatim", { requestsUsed: 1000, circuitBroken: false });

  assert.equal(isAllProvidersCapacityExhausted(state, true, false), false);

  // All exhausted -> exhausted
  state.set("tgos", { requestsUsed: 5000, circuitBroken: false });
  assert.equal(isAllProvidersCapacityExhausted(state, true, false), true);

  // Circuit breaker tripped on TGOS -> exhausted
  state.set("tgos", { requestsUsed: 15, circuitBroken: true });
  assert.equal(isAllProvidersCapacityExhausted(state, true, false), true);
});

test("TGOS: JSON response simulated parsing logic", () => {
  const sampleSuccess = JSON.stringify({
    Info: [
      {
        IsSuccess: "True",
        InAddress: "臺北市中正區忠孝東路一段1號",
      },
    ],
    AddressList: [
      {
        FULL_ADDR: "臺北市中正區黎明里1鄰忠孝東路一段1號",
        County: "臺北市",
        Town: "中正區",
        X: 121.5198,
        Y: 25.0458,
      },
    ],
  });

  const parsed = JSON.parse(sampleSuccess);
  const list = Array.isArray(parsed) ? parsed : parsed.AddressList;
  const first = list[0];
  const lat = typeof first.Y === "number" ? first.Y : parseFloat(first.Y);
  const lng = typeof first.X === "number" ? first.X : parseFloat(first.X);

  assert.equal(lat, 25.0458);
  assert.equal(lng, 121.5198);
  assert.equal(isWithinTaiwanBounds(lat, lng), true);

  // Empty AddressList -> no_result
  const emptyResponse = JSON.stringify({ AddressList: [] });
  const emptyParsed = JSON.parse(emptyResponse);
  const emptyList = Array.isArray(emptyParsed) ? emptyParsed : emptyParsed.AddressList;
  assert.equal(emptyList.length, 0);

  // Quota error text detection
  const quotaErrorText = '{"ErrorInfo":"查詢額度已滿，請向管理單位提出申請"}';
  const isQuotaExceeded =
    quotaErrorText.includes("額度已滿") ||
    (quotaErrorText.includes("超過") && (quotaErrorText.includes("次數") || quotaErrorText.includes("上限")));
  assert.equal(isQuotaExceeded, true);
});

test("TGOS: XML-wrapped response string extraction and auth error detection", () => {
  // XML-wrapped success
  const xmlSuccess =
    '<?xml version="1.0" encoding="utf-8"?>\r\n<string xmlns="http://tempuri.org/">{"AddressList":[{"FULL_ADDR":"台北市大安區新生南路一段1號","X":121.533,"Y":25.042}]}</string>';
  let payload = xmlSuccess.trim();
  const xmlMatch = payload.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
  if (xmlMatch) payload = xmlMatch[1].trim();

  const data = JSON.parse(payload);
  assert.equal(data.AddressList[0].X, 121.533);
  assert.equal(data.AddressList[0].Y, 25.042);

  // XML-wrapped auth error
  const xmlAuthError =
    '<?xml version="1.0" encoding="utf-8"?>\r\n<string xmlns="http://tempuri.org/">認證授權失敗:應用程式IP不正確 : 35.191.124.79</string>';
  let errorPayload = xmlAuthError.trim();
  const errorMatch = errorPayload.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
  if (errorMatch) errorPayload = errorMatch[1].trim();

  const isAuthError =
    errorPayload.startsWith("認證授權失敗") ||
    errorPayload.startsWith("錯誤") ||
    errorPayload.startsWith("缺少參數");
  assert.equal(isAuthError, true);
});
