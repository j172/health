// Parser / seed / overview tests for the MOA ForestFireAlertWCF pipeline (B-12,
// issue #672, docs/2.0/track-b-opendata-phase2-3-spec.md section 2.4 D-2).
//
// The fixture is the real response of
//   GET https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/?CreateDate=2026-10-15
// captured on 2026-10-15 (61 rows, 7.7 KB: 41 安全 / 14 注意 / 4 警告 / 2 最危險).
// Malformed / edge-case payloads are hand-written inline, not in the fixture,
// same convention as lib/server/who/sources/who.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const levels = await import("@/lib/tools/forestFire/levels.ts");
const { parseForestFire, normalizeCreateDate, taipeiDate, buildForestFireUrl } = await import(
  "./parse.ts"
);
const { FOREST_FIRE_SITES, getForestFireSite, listSitesMissingCoordinates } = await import(
  "./data/forestFireSites.ts"
);
const { buildForestFireOverview } = await import("./overview.ts");

const readFixture = () =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("./__fixtures__/moa-forest-fire-20261015.json", import.meta.url)),
      "utf-8",
    ),
  );

const TODAY = "2026-10-15";

const row = (overrides = {}) => ({
  Code: 1,
  CreateDate: TODAY,
  error_msg: "NULL",
  name: "太平山國家森林遊樂區",
  warn_level: 0,
  warn_level_chinese: "安全",
  ...overrides,
});

// --- levels -----------------------------------------------------------------

test("resolveForestFireLevel maps the documented 0-4 numeric and 中文 labels (they must agree)", () => {
  const { resolveForestFireLevel } = levels;
  assert.equal(resolveForestFireLevel(0, "安全"), 0);
  assert.equal(resolveForestFireLevel(1, "注意"), 1);
  assert.equal(resolveForestFireLevel("2", "警告"), 2);
  assert.equal(resolveForestFireLevel(3, "危險"), 3);
  assert.equal(resolveForestFireLevel("4", "最危險"), 4);
});

test("resolveForestFireLevel accepts a single recognised signal when the other field is empty", () => {
  const { resolveForestFireLevel } = levels;
  assert.equal(resolveForestFireLevel(2, undefined), 2);
  assert.equal(resolveForestFireLevel(null, "危險"), 3);
  assert.equal(resolveForestFireLevel("", "注意"), 1);
  assert.equal(resolveForestFireLevel("NULL", "安全"), 0);
});

test("resolveForestFireLevel returns null (never 0 / 安全) for unknown, missing or conflicting values", () => {
  const { resolveForestFireLevel } = levels;
  assert.equal(resolveForestFireLevel(undefined, undefined), null);
  assert.equal(resolveForestFireLevel(null, null), null);
  assert.equal(resolveForestFireLevel("", ""), null);
  assert.equal(resolveForestFireLevel(5, "安全"), null, "out-of-range number, even beside a valid label");
  assert.equal(resolveForestFireLevel(-1, undefined), null);
  assert.equal(resolveForestFireLevel(1.5, undefined), null);
  assert.equal(resolveForestFireLevel("abc", undefined), null);
  assert.equal(resolveForestFireLevel(undefined, "未知"), null);
  assert.equal(resolveForestFireLevel(0, "危險"), null, "numeric and 中文 disagree -> conflict, not 'safe'");
  assert.equal(resolveForestFireLevel(3, "安全"), null);
});

test("every level has a 中文 name, a grade, and fire-use advice; 安全 never claims zero risk", () => {
  const { FOREST_FIRE_LEVELS, FOREST_FIRE_LEVEL_VALUES } = levels;
  assert.deepEqual([...FOREST_FIRE_LEVEL_VALUES], [0, 1, 2, 3, 4]);
  for (const level of FOREST_FIRE_LEVEL_VALUES) {
    const meta = FOREST_FIRE_LEVELS[level];
    assert.equal(meta.level, level);
    assert.ok(meta.name && meta.advice, `level ${level} needs name + advice`);
  }
  assert.equal(FOREST_FIRE_LEVELS[0].name, "安全");
  assert.match(FOREST_FIRE_LEVELS[0].advice, /小心使用火源/);
  assert.equal(FOREST_FIRE_LEVELS[4].name, "最危險");
});

// --- date helpers -------------------------------------------------------------

test("taipeiDate converts an instant to the Asia/Taipei calendar date regardless of host timezone", () => {
  assert.equal(taipeiDate(new Date("2026-10-15T15:59:59Z")), "2026-10-15");
  assert.equal(taipeiDate(new Date("2026-10-15T16:00:00Z")), "2026-10-16");
  assert.equal(taipeiDate(new Date("2026-01-01T00:30:00+08:00")), "2026-01-01");
});

test("normalizeCreateDate accepts ISO / slash / timestamp forms and rejects garbage", () => {
  assert.equal(normalizeCreateDate("2026-10-15"), "2026-10-15");
  assert.equal(normalizeCreateDate("2026/10/15"), "2026-10-15");
  assert.equal(normalizeCreateDate("2026-10-15T00:00:00"), "2026-10-15");
  assert.equal(normalizeCreateDate(" 2026-1-5 "), "2026-01-05");
  assert.equal(normalizeCreateDate("2026-13-01"), null);
  assert.equal(normalizeCreateDate("2026-02-30"), null);
  assert.equal(normalizeCreateDate(""), null);
  assert.equal(normalizeCreateDate(null), null);
  assert.equal(normalizeCreateDate("NULL"), null);
});

test("buildForestFireUrl asks the upstream for the single day only (never the 381 KB full history)", () => {
  assert.equal(
    buildForestFireUrl("2026-10-15"),
    "https://data.moa.gov.tw/api/v1/ForestFireAlertWCF/?CreateDate=2026-10-15",
  );
});

// --- parseForestFire ----------------------------------------------------------

test("parseForestFire on the real 2026-10-15 fixture yields 61 sites with the published level distribution", () => {
  const parsed = parseForestFire(readFixture(), TODAY);
  assert.equal(parsed.rows.length, 61);
  assert.equal(parsed.unknownLevel.length, 0);
  assert.equal(parsed.errored.length, 0);
  assert.equal(parsed.ignoredNotToday, 0);
  assert.equal(parsed.malformed, 0);

  const dist = {};
  for (const r of parsed.rows) dist[r.level] = (dist[r.level] ?? 0) + 1;
  // 安全 41、注意 14、警告 4、最危險 2 (spec section 2.4 D-2, measured live).
  assert.deepEqual(dist, { 0: 41, 1: 14, 2: 4, 4: 2 });

  const first = parsed.rows.find((r) => r.siteCode === "1");
  assert.deepEqual(first, {
    siteCode: "1",
    name: "太平山國家森林遊樂區",
    level: 0,
    createdDate: "2026-10-15",
  });
});

test("parseForestFire keeps only today's rows when handed the multi-date history", () => {
  const history = [
    row({ Code: 1, CreateDate: "2026-10-14", warn_level: 3, warn_level_chinese: "危險" }),
    row({ Code: 1, CreateDate: "2026-10-15", warn_level: 1, warn_level_chinese: "注意" }),
    row({ Code: 2, CreateDate: "2026-07-21" }),
  ];
  const parsed = parseForestFire(history, TODAY);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].level, 1);
  assert.equal(parsed.ignoredNotToday, 2);
});

test("parseForestFire treats the literal string 'NULL' in error_msg as no error, but a real message as untrusted", () => {
  const parsed = parseForestFire(
    [
      row({ Code: 1, error_msg: "NULL" }),
      row({ Code: 2, error_msg: null }),
      row({ Code: 3, error_msg: "" }),
      row({ Code: 4, error_msg: "null" }),
      row({ Code: 5, error_msg: "測站資料遺失", warn_level: 0, warn_level_chinese: "安全" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    parsed.rows.map((r) => r.siteCode),
    ["1", "2", "3", "4"],
  );
  assert.equal(parsed.errored.length, 1);
  assert.equal(parsed.errored[0].siteCode, "5");
  assert.equal(parsed.errored[0].errorMsg, "測站資料遺失");
});

test("parseForestFire drops unknown levels instead of treating them as safe", () => {
  const parsed = parseForestFire(
    [
      row({ Code: 1, warn_level: 9, warn_level_chinese: "超級危險" }),
      row({ Code: 2, warn_level: undefined, warn_level_chinese: undefined }),
      row({ Code: 3, warn_level: null, warn_level_chinese: "" }),
      row({ Code: 4, warn_level: 0, warn_level_chinese: "危險" }),
      row({ Code: 5, warn_level: 2, warn_level_chinese: "警告" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    parsed.rows.map((r) => r.siteCode),
    ["5"],
  );
  assert.deepEqual(
    parsed.unknownLevel.map((r) => r.siteCode).sort(),
    ["1", "2", "3", "4"],
  );
  assert.ok(
    parsed.rows.every((r) => r.level !== 0),
    "no unknown value may be coerced to level 0 (safe)",
  );
});

test("parseForestFire normalises Code (number or string) and skips rows with no usable code or name", () => {
  const parsed = parseForestFire(
    [
      row({ Code: "3401", name: "麗陽", warn_level: "1", warn_level_chinese: "注意" }),
      row({ Code: null }),
      row({ Code: 7, name: "  " }),
      row({ Code: 8, name: undefined }),
      "not an object",
      null,
    ],
    TODAY,
  );
  assert.deepEqual(
    parsed.rows.map((r) => [r.siteCode, r.name, r.level]),
    [["3401", "麗陽", 1]],
  );
  assert.equal(parsed.malformed, 5);
});

test("parseForestFire collapses a duplicated site code to the most severe level", () => {
  const parsed = parseForestFire(
    [
      row({ Code: 9, warn_level: 1, warn_level_chinese: "注意" }),
      row({ Code: 9, warn_level: 3, warn_level_chinese: "危險" }),
      row({ Code: 9, warn_level: 0, warn_level_chinese: "安全" }),
    ],
    TODAY,
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].level, 3);
  assert.equal(parsed.duplicates, 2);
});

test("parseForestFire: an empty array is a valid 'nothing published yet' answer, anything else non-array throws", () => {
  const empty = parseForestFire([], TODAY);
  assert.equal(empty.rows.length, 0);
  assert.throws(() => parseForestFire({ RS: "ERROR", MSG: "x" }, TODAY), /array/i);
  assert.throws(() => parseForestFire(null, TODAY), /array/i);
  assert.throws(() => parseForestFire("[]", TODAY), /array/i);
});

test("parseForestFire requires an ISO 'today'", () => {
  assert.throws(() => parseForestFire([], "10/15/2026"), /today/i);
});

// --- seed completeness (61 sites must each have coordinates) --------------------

const TAIWAN_BOUNDS = { latMin: 21.5, latMax: 25.5, lngMin: 119.5, lngMax: 122.5 };

test("listSitesMissingCoordinates reports every site lacking finite coordinates (the guard the 61-site test relies on)", () => {
  const seed = [
    { code: "1", lat: 24.5, lng: 121.5 },
    { code: "2", lat: null, lng: 121.5 },
    { code: "3", lat: 24.5 },
    { code: "4", lat: Number.NaN, lng: 121 },
    { code: "5", lat: 0, lng: 0 },
  ];
  const missing = listSitesMissingCoordinates(["1", "2", "3", "4", "5", "6"], seed);
  assert.deepEqual(missing, ["2", "3", "4", "5", "6"]);
});

test("every one of the 61 locations in the live ForestFireAlertWCF feed has coordinates in the seed", () => {
  const fixture = readFixture();
  const codes = [...new Set(fixture.map((r) => String(r.Code)))];
  assert.equal(codes.length, 61, "fixture must carry the full 61-site roster");

  const missing = listSitesMissingCoordinates(codes, FOREST_FIRE_SITES);
  assert.deepEqual(missing, [], `locations without coordinates in the seed: ${missing.join(", ")}`);

  for (const r of fixture) {
    const site = getForestFireSite(String(r.Code));
    assert.ok(site, `no seed entry for ${r.Code} ${r.name}`);
    assert.equal(site.name, r.name, `seed name for ${r.Code} must match the feed`);
  }
});

test("seed coordinates are plausible WGS84 values inside Taiwan and carry their evidence", () => {
  assert.equal(FOREST_FIRE_SITES.length, 61);
  const codes = new Set();
  for (const s of FOREST_FIRE_SITES) {
    assert.ok(!codes.has(s.code), `duplicate seed code ${s.code}`);
    codes.add(s.code);
    assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lng), `${s.code} ${s.name}: non-finite coordinate`);
    assert.ok(
      s.lat >= TAIWAN_BOUNDS.latMin && s.lat <= TAIWAN_BOUNDS.latMax &&
        s.lng >= TAIWAN_BOUNDS.lngMin && s.lng <= TAIWAN_BOUNDS.lngMax,
      `${s.code} ${s.name}: (${s.lat}, ${s.lng}) is outside Taiwan (lat/lng swapped?)`,
    );
    assert.ok(["recreation_area", "station"].includes(s.kind), `${s.code}: kind`);
    assert.equal(s.kind, Number(s.code) < 100 ? "recreation_area" : "station", `${s.code}: kind must follow the code range`);
    assert.ok(s.county && s.cityCode, `${s.code}: county + cityCode required`);
    assert.ok(["code", "name"].includes(s.match), `${s.code}: match evidence`);
    assert.ok(s.ffwiCode, `${s.code}: ffwiCode evidence`);
    if (s.match === "code") assert.equal(s.ffwiCode, s.code, `${s.code}: code-matched sites must share the code`);
  }
});

test("the two sites whose MOA code differs from the 林火風險評估系統 code are name-matched and explicitly recorded", () => {
  const nameMatched = FOREST_FIRE_SITES.filter((s) => s.match === "name").map((s) => s.code).sort();
  assert.deepEqual(nameMatched, ["1102", "2101"]);
  assert.equal(getForestFireSite("1102").ffwiCode, "1601");
  assert.equal(getForestFireSite("2101").ffwiCode, "2501");
});

test("seed cityCodes are all real outdoor-safety city codes", () => {
  const queriesSrc = readFileSync(
    fileURLToPath(new URL("../outdoorSafety/queries.ts", import.meta.url)),
    "utf-8",
  );
  const known = new Set([...queriesSrc.matchAll(/code:\s*"([A-Z]+)"/g)].map((m) => m[1]));
  assert.equal(known.size, 22);
  for (const s of FOREST_FIRE_SITES) {
    assert.ok(known.has(s.cityCode), `${s.code} ${s.name}: unknown cityCode ${s.cityCode}`);
  }
});

// --- buildForestFireOverview ----------------------------------------------------

const stored = (siteCode, siteName, warnLevel, createdDate = TODAY) => ({
  siteCode,
  siteName,
  warnLevel,
  createdDate,
});

test("buildForestFireOverview sorts the most dangerous sites first and counts today's levels", () => {
  const overview = buildForestFireOverview(
    [
      stored("1", "太平山國家森林遊樂區", 0),
      stored("13", "墾丁國家森林遊樂區", 4),
      stored("2", "滿月圓國家森林遊樂區", 1),
      stored("6301", "恆春", 4),
    ],
    TODAY,
  );
  assert.equal(overview.today, TODAY);
  assert.equal(overview.asOf, TODAY);
  assert.equal(overview.isCurrent, true);
  assert.deepEqual(overview.counts, { 0: 1, 1: 1, 2: 0, 3: 0, 4: 2 });
  assert.deepEqual(
    overview.sites.map((s) => s.siteCode),
    ["13", "6301", "2", "1"],
  );
  const kenting = overview.sites[0];
  assert.equal(kenting.levelName, "最危險");
  assert.equal(kenting.county, "屏東縣");
  assert.equal(kenting.cityCode, "PTH");
  assert.equal(typeof kenting.lat, "number");
  assert.equal(kenting.stale, false);
});

test("buildForestFireOverview flags rows that are not from today as stale and excludes them from the counts", () => {
  const overview = buildForestFireOverview(
    [stored("1", "太平山國家森林遊樂區", 0, "2026-10-13"), stored("2", "滿月圓國家森林遊樂區", 2, "2026-10-13")],
    TODAY,
  );
  assert.equal(overview.isCurrent, false);
  assert.equal(overview.asOf, "2026-10-13");
  assert.deepEqual(overview.counts, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
  assert.equal(overview.staleCount, 2);
  assert.ok(overview.sites.every((s) => s.stale === true));
});

test("buildForestFireOverview never shows an unrecognised stored level as safe: it is dropped", () => {
  const overview = buildForestFireOverview(
    [stored("1", "太平山國家森林遊樂區", 7), stored("2", "滿月圓國家森林遊樂區", -1), stored("3", "內洞國家森林遊樂區", 1)],
    TODAY,
  );
  assert.deepEqual(
    overview.sites.map((s) => s.siteCode),
    ["3"],
  );
  assert.equal(overview.counts[0], 0);
});

test("buildForestFireOverview keeps a site that is missing from the seed, with null coordinates instead of invented ones", () => {
  const overview = buildForestFireOverview([stored("99999", "新增測站", 2)], TODAY);
  assert.equal(overview.sites.length, 1);
  assert.equal(overview.sites[0].lat, null);
  assert.equal(overview.sites[0].lng, null);
  assert.equal(overview.sites[0].cityCode, null);
});

test("buildForestFireOverview with no rows reports 'no data' (asOf null), not an all-safe board", () => {
  const overview = buildForestFireOverview([], TODAY);
  assert.equal(overview.asOf, null);
  assert.equal(overview.isCurrent, false);
  assert.equal(overview.sites.length, 0);
  assert.deepEqual(overview.counts, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
});
