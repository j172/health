#!/usr/bin/env node
/**
 * Deterministic assertion tests for the geocode batch job's pure logic
 * (address normalization, Taiwan bounding box, budget/circuit-breaker
 * arithmetic, dedup, priority-source list shape). No test framework — this
 * repo has none (see docs/specs/phase9-opencage-geocode-batch.md's
 * acceptance criteria discussion) — plain node:assert, run directly:
 *   node scripts/test-geocode-batch.mjs
 * Network-calling code (queryOpenCage/queryNominatim's HTTP paths,
 * runGeocodeBatch's DB orchestration) is intentionally not covered here —
 * it's exercised live via the GHA workflow instead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// ─── normalizeAddressForQuery ──────────────────────────────────────────────
// Re-implemented inline (not imported) so this script can run standalone via
// plain `node` without a TS/path-alias loader — see addressNormalize.ts for
// the actual production implementation this mirrors.
const VARIANT_REPLACEMENTS = [
  [/臺/g, "台"],
  [/　/g, " "],
  [/[，,]/g, "，"],
];
const CHINESE_DIGIT_MAP = {
  零: "0",
  "〇": "0",
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};
function parseChineseNumber(str) {
  if (!/[十百千]/.test(str)) {
    return str
      .split("")
      .map((c) => (CHINESE_DIGIT_MAP[c] !== undefined ? CHINESE_DIGIT_MAP[c] : c))
      .join("");
  }
  let total = 0;
  let current = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "千") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (char === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (CHINESE_DIGIT_MAP[char] !== undefined) {
      current = parseInt(CHINESE_DIGIT_MAP[char]);
    }
  }
  total += current;
  return String(total);
}
const PARENTHETICAL_PATTERN = /[（(【\[][^）)】\]]*[）)】\]]/g;
const appendCountry = (address) => (address.includes("台灣") ? address : `${address}, 台灣`);
function cleanAddress(rawAddress) {
  let cleaned = rawAddress.trim();
  if (!cleaned) return "";
  for (const [pattern, replacement] of VARIANT_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(/[０-９]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xfee0));
  cleaned = cleaned.replace(PARENTHETICAL_PATTERN, " ");
  cleaned = cleaned.replace(/([零〇一二三四五六七八九十百千]+)(號|樓|巷|弄|段)/g, (_m, p1, p2) => {
    return parseChineseNumber(p1) + p2;
  });
  cleaned = cleaned.replace(/\s+/g, " ").replace(/，+/g, "，").trim();
  cleaned = cleaned.replace(/^[，,]+|[，,]+$/g, "").trim();
  return cleaned;
}
function normalizeAddressForQuery(rawAddress) {
  const cleaned = cleanAddress(rawAddress);
  return cleaned ? appendCountry(cleaned) : "";
}

test("normalizeAddressForQuery: 臺 -> 台, appends 台灣", () => {
  assert.equal(normalizeAddressForQuery("臺北市信義區信義路五段7號"), "台北市信義區信義路5段7號, 台灣");
});

test("normalizeAddressForQuery: strips parenthetical notes", () => {
  assert.equal(normalizeAddressForQuery("台北市大安區忠孝東路四段1號（近捷運忠孝敦化站）"), "台北市大安區忠孝東路4段1號, 台灣");
  assert.equal(normalizeAddressForQuery("台中市西區英才路100號(1樓)"), "台中市西區英才路100號, 台灣");
});

test("normalizeAddressForQuery: converts Chinese numbers & full-width digits", () => {
  assert.equal(normalizeAddressForQuery("臺北市中正區汀州路二段二一二號"), "台北市中正區汀州路2段212號, 台灣");
  assert.equal(normalizeAddressForQuery("高雄市苓雅區四維三路４３號"), "高雄市苓雅區四維三路43號, 台灣");
});

test("normalizeAddressForQuery: already contains 台灣 -> not duplicated", () => {
  assert.equal(normalizeAddressForQuery("台灣台北市中正區重慶南路一段122號"), "台灣台北市中正區重慶南路1段122號");
});

test("normalizeAddressForQuery: empty/whitespace-only -> empty string", () => {
  assert.equal(normalizeAddressForQuery(""), "");
  assert.equal(normalizeAddressForQuery("   "), "");
  assert.equal(normalizeAddressForQuery("（僅供參考）"), "");
});

test("normalizeAddressForQuery: full-width space and comma variants collapse", () => {
  assert.equal(normalizeAddressForQuery("高雄市苓雅區　四維三路2號,高雄"), "高雄市苓雅區 四維三路2號，高雄, 台灣");
});

// ─── buildQueryCandidates (progressive address-simplification cascade) ────
const FALLBACK_STRIPS = [
  /(\d+樓|\d+F|B\d+|地下.*|之\d+號|附\d+號).*$/i,
  /\d+號.*$/,
  /(\d+巷|\d+弄).*$/,
];
function buildQueryCandidates(rawAddress) {
  const base = cleanAddress(rawAddress);
  if (!base) return [];
  const candidates = [];
  const seen = new Set();
  let candidate = base;
  for (let attempt = 0; attempt <= FALLBACK_STRIPS.length; attempt++) {
    if (attempt > 0) {
      candidate = candidate.replace(FALLBACK_STRIPS[attempt - 1], "").trim();
    }
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    candidates.push(appendCountry(candidate));
  }
  return candidates;
}

test("buildQueryCandidates: full address with 巷/號 -> progressively-simplified candidates", () => {
  const candidates = buildQueryCandidates("台北市信義區信義路二段79巷15號之8");
  assert.deepEqual(candidates, [
    "台北市信義區信義路2段79巷15號之8, 台灣",
    "台北市信義區信義路2段79巷, 台灣",
    "台北市信義區信義路2段, 台灣",
  ]);
});

test("buildQueryCandidates: address with only 號, no 巷/弄 -> simplified candidates", () => {
  const candidates = buildQueryCandidates("台北市信義路五段7號");
  assert.deepEqual(candidates, ["台北市信義路5段7號, 台灣", "台北市信義路5段, 台灣"]);
});

test("buildQueryCandidates: empty address -> empty array", () => {
  assert.deepEqual(buildQueryCandidates(""), []);
});

// ─── isWithinTaiwanBounds ───────────────────────────────────────────────────
const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 };
function isWithinTaiwanBounds(lat, lng) {
  return lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;
}

test("isWithinTaiwanBounds: Taipei 101 is inside", () => {
  assert.equal(isWithinTaiwanBounds(25.033976, 121.564472), true);
});

test("isWithinTaiwanBounds: Kaohsiung is inside", () => {
  assert.equal(isWithinTaiwanBounds(22.6273, 120.3014), true);
});

test("isWithinTaiwanBounds: Shanghai is outside", () => {
  assert.equal(isWithinTaiwanBounds(31.2304, 121.4737), false);
});

test("isWithinTaiwanBounds: Tokyo is outside", () => {
  assert.equal(isWithinTaiwanBounds(35.6762, 139.6503), false);
});

test("isWithinTaiwanBounds: boundary is inclusive", () => {
  assert.equal(isWithinTaiwanBounds(TAIWAN_BOUNDS.minLat, TAIWAN_BOUNDS.minLng), true);
  assert.equal(isWithinTaiwanBounds(TAIWAN_BOUNDS.maxLat, TAIWAN_BOUNDS.maxLng), true);
});

// ─── Daily budget / circuit breaker arithmetic ─────────────────────────────
const DAILY_BUDGET = { opencage: 1400, nominatim: 1000 };
function isBudgetExhausted(state, provider) {
  const row = state.get(provider);
  if (!row) return false;
  return row.circuitBroken || row.requestsUsed >= DAILY_BUDGET[provider];
}

test("isBudgetExhausted: no row yet today -> not exhausted", () => {
  assert.equal(isBudgetExhausted(new Map(), "opencage"), false);
});

test("isBudgetExhausted: under the cap -> not exhausted", () => {
  const state = new Map([["opencage", { requestsUsed: 1399, circuitBroken: false }]]);
  assert.equal(isBudgetExhausted(state, "opencage"), false);
});

test("isBudgetExhausted: at the cap -> exhausted", () => {
  const state = new Map([["opencage", { requestsUsed: 1400, circuitBroken: false }]]);
  assert.equal(isBudgetExhausted(state, "opencage"), true);
});

test("isBudgetExhausted: circuit broken well under the cap -> still exhausted", () => {
  const state = new Map([["nominatim", { requestsUsed: 5, circuitBroken: true }]]);
  assert.equal(isBudgetExhausted(state, "nominatim"), true);
});

test("isBudgetExhausted: providers are independent", () => {
  const state = new Map([
    ["opencage", { requestsUsed: 1400, circuitBroken: false }],
    ["nominatim", { requestsUsed: 0, circuitBroken: false }],
  ]);
  assert.equal(isBudgetExhausted(state, "opencage"), true);
  assert.equal(isBudgetExhausted(state, "nominatim"), false);
});

// ─── Batch-local address dedup ──────────────────────────────────────────────
function dedupByNormalizedAddress(rows) {
  const idsByQuery = new Map();
  for (const row of rows) {
    const query = normalizeAddressForQuery(row.address);
    if (!query) continue;
    const ids = idsByQuery.get(query) ?? [];
    ids.push(row.id);
    idsByQuery.set(query, ids);
  }
  return idsByQuery;
}

test("dedupByNormalizedAddress: identical addresses (incl. 臺/台 variant) collapse to one query, all ids applied", () => {
  const rows = [
    { id: 1, address: "台北市中山區南京東路一段1號" },
    { id: 2, address: "臺北市中山區南京東路一段1號" },
    { id: 3, address: "高雄市前鎮區中山二路2號" },
  ];
  const grouped = dedupByNormalizedAddress(rows);
  assert.equal(grouped.size, 2);
  assert.deepEqual(grouped.get("台北市中山區南京東路1段1號, 台灣"), [1, 2]);
  assert.deepEqual(grouped.get("高雄市前鎮區中山二路2號, 台灣"), [3]);
});

test("dedupByNormalizedAddress: blank address is skipped entirely", () => {
  const rows = [{ id: 1, address: "" }, { id: 2, address: "台北市信義區松高路1號" }];
  const grouped = dedupByNormalizedAddress(rows);
  assert.equal(grouped.size, 1);
  assert.equal(grouped.has(""), false);
});

// ─── SOURCES_IN_PRIORITY shape (loaded from the real TS source as text — no
// TS loader needed since this only checks the list literal, not behavior) ──
test("SOURCES_IN_PRIORITY: 16 sources, all with non-empty facilityType/sourceKey, no duplicate (facilityType, sourceKey) pair", () => {
  const src = readGeocodeBatchSource();
  const listMatch = src.match(/SOURCES_IN_PRIORITY:.*?=\s*\[([\s\S]*?)\n\];/);
  assert.ok(listMatch, "could not locate SOURCES_IN_PRIORITY literal in geocodeBatch.ts");
  const entries = [...listMatch[1].matchAll(/facilityType:\s*"([^"]+)",\s*sourceKey:\s*"([^"]+)"/g)];
  assert.equal(entries.length, 16);
  const seen = new Set();
  for (const [, facilityType, sourceKey] of entries) {
    assert.ok(facilityType.length > 0);
    assert.ok(sourceKey.length > 0);
    const key = `${facilityType}::${sourceKey}`;
    assert.equal(seen.has(key), false, `duplicate source: ${key}`);
    seen.add(key);
  }
});

function readGeocodeBatchSource() {
  return readFileSync(path.join(__dirname, "..", "lib", "server", "facilities", "geocodeBatch.ts"), "utf-8");
}

console.log(`\n${passed} passed`);
