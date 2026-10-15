// Issue #680 (B-18): adapter for 臺中市垃圾清運及資源回收車動態資訊 (data.gov.tw 83558).
// Three rows of the fixture (KED-1385, 850-UE, 602-VP) are real records from a
// plain GET of the public dataset on 2026-10-16 00:28 (+08:00); they show the
// live shape: a JSON array whose values are all strings, X = longitude,
// Y = latitude, time as `20261016T001948`. 602-VP is the real feed's oldest
// row (2025-09-29) — the reason the spec says 臺中 "must filter expired
// positions". The TST-xxxx rows are synthetic and cover fresh / stale / expired
// / future reports, a vehicle reported twice, a row without coordinates,
// coordinates in 臺北市, swapped X/Y, an unparseable time, a row with no plate,
// and a `null` array element.
//
// Where the expired rows are removed: a parser has no clock and the snapshot is
// served for ~90 s, so adaptTaichung keeps every well-formed row and
// getLiveTrucks (judging against the clock on every request) hides what is
// older than 30 minutes. The last block of tests runs the real adapter through
// getLiveTrucks to prove 臺中's old rows never reach the map.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../../", import.meta.url);

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

const { adaptTaichung, parseTaichungTime, taichungLiveAdapter } = await import("./taichung83558.ts");
const { getLiveTrucks, resetLiveTruckCacheForTests } = await import("../getLiveTrucks.ts");

const fixtureText = readFileSync(new URL("../__fixtures__/taichung-83558-sample.json", import.meta.url), "utf-8");

// 2026-10-16 00:28:09 in Taipei — the moment the real rows were fetched.
const T0 = Date.parse("2026-10-15T16:28:09Z");

beforeEach(() => resetLiveTruckCacheForTests());

test("adaptTaichung: keeps every well-formed in-area row — one position per vehicle (the newest report wins)", () => {
  const positions = adaptTaichung(fixtureText);
  assert.deepEqual(
    positions.map((p) => p.car).sort(),
    ["602-VP", "850-UE", "KED-1385", "TST-1001", "TST-1002", "TST-1003", "TST-1004", "TST-1005", "TST-1006", "TST-1007"],
  );
  // TST-1007 appears twice (00:22:00 and 00:05:00): the later report is the one kept.
  const doubled = positions.find((p) => p.car === "TST-1007");
  assert.equal(doubled.recordedAt, "2026-10-15T16:22:00.000Z");
  assert.equal(doubled.location, "臺中市南區復興路三段1號");
});

test("adaptTaichung: maps the real row's columns — X is the longitude, Y the latitude — and reads the compact time as Asia/Taipei", () => {
  const real = adaptTaichung(fixtureText).find((p) => p.car === "KED-1385");
  assert.deepEqual(real, {
    lineId: "24908",
    car: "KED-1385",
    lat: 24.192398,
    lng: 120.540645,
    location: "龍井區清潔隊回收廠",
    district: null,
    // 20261016T001948 in Asia/Taipei (UTC+8) is the previous UTC day
    recordedAt: "2026-10-15T16:19:48.000Z",
  });
});

test("adaptTaichung: a parked truck (speed 0) is still a truck — speed is not a filter (a truck stops at every collection point)", () => {
  const cars = new Set(adaptTaichung(fixtureText).map((p) => p.car));
  assert.ok(cars.has("KED-1385"), "the real row has SpeedValue 0");
  assert.ok(cars.has("TST-1003"));
});

test("adaptTaichung: a truck currently outside the county (real row in 南投縣信義鄉) is still 臺中's truck and stays", () => {
  const row = adaptTaichung(fixtureText).find((p) => p.car === "850-UE");
  assert.equal(row.lat, 23.701848);
  assert.equal(row.lng, 120.853785);
});

test("adaptTaichung: drops rows with no coordinates, coordinates far outside 臺中, swapped X/Y, an unparseable time, or no plate", () => {
  const cars = new Set(adaptTaichung(fixtureText).map((p) => p.car));
  assert.ok(!cars.has("TST-1008"), "empty X and Y");
  assert.ok(!cars.has("TST-1009"), "coordinates are in 臺北市");
  assert.ok(!cars.has("TST-1010"), "X and Y swapped");
  assert.ok(!cars.has("TST-1011"), "time is not a time");
  assert.ok(!cars.has(""), "no plate");
});

test("adaptTaichung skips array elements that are not objects (the fixture ends with a null) — but an array with no object at all is a changed shape", () => {
  assert.ok(/,\s*null\s*\]\s*$/.test(fixtureText), "the fixture should end with a null element");
  assert.ok(adaptTaichung(fixtureText).length > 0);
  assert.throws(() => adaptTaichung('[null, 3, "x", []]'), /unexpected shape/);
});

test("adaptTaichung does not judge freshness: the 2025-09-29 real row and a report 'from the future' are still parsed (getLiveTrucks decides, per request)", () => {
  const byCar = Object.fromEntries(adaptTaichung(fixtureText).map((p) => [p.car, p]));
  assert.equal(byCar["602-VP"].recordedAt, "2025-09-29T01:04:37.000Z");
  assert.equal(byCar["TST-1004"].recordedAt, "2026-09-14T06:04:37.000Z");
  assert.equal(byCar["TST-1005"].recordedAt, "2026-10-15T17:10:00.000Z");
});

test("adaptTaichung: an empty array is an honest 'no trucks reporting' (empty list), not an error", () => {
  assert.deepEqual(adaptTaichung("[]"), []);
  assert.deepEqual(adaptTaichung(" [ ] \n"), []);
});

test("adaptTaichung: an empty body, an HTML page or a renamed/changed shape throws, so the county degrades instead of showing 'no trucks'", () => {
  assert.throws(() => adaptTaichung(""), /empty/i);
  assert.throws(() => adaptTaichung("   \n"), /empty/i);
  assert.throws(() => adaptTaichung("<html><body>Service Unavailable</body></html>"), /not JSON/);
  assert.throws(() => adaptTaichung('{"error":"quota exceeded"}'), /JSON array/);
  assert.throws(() => adaptTaichung('{"data":[{"car":"A"}]}'), /JSON array/);
  // Columns renamed: rows exist but none has the columns we read.
  assert.throws(() => adaptTaichung('[{"lineid":"1","plate":"A","time":"20261016T001948","x":"120.6","y":"24.1"}]'), /unexpected shape/);
  // Time format changed to something unrecognisable: every row would silently drop.
  assert.throws(
    () => adaptTaichung('[{"lineid":"1","car":"A","time":"16/10/2026 00:19","location":"x","X":"120.6","Y":"24.1"}]'),
    /report time/,
  );
});

test("adaptTaichung tolerates a BOM (the dataset has none today; a re-export might add one)", () => {
  const withBom = `﻿${fixtureText}`;
  assert.deepEqual(adaptTaichung(withBom), adaptTaichung(fixtureText));
});

test("adaptTaichung accepts numeric coordinates as well as the strings the feed publishes today", () => {
  const rows = '[{"lineid":"1","car":"TST-N","time":"20261016T001948","location":"x","X":120.64,"Y":24.14}]';
  const [position] = adaptTaichung(rows);
  assert.equal(position.lat, 24.14);
  assert.equal(position.lng, 120.64);
});

test("parseTaichungTime: the feed's compact `YYYYMMDDTHHMMSS` reads as Asia/Taipei; the siblings' dash/slash forms are accepted too", () => {
  assert.equal(parseTaichungTime("20261015T221648"), "2026-10-15T14:16:48.000Z");
  assert.equal(parseTaichungTime("20261016T001948"), "2026-10-15T16:19:48.000Z");
  assert.equal(parseTaichungTime("  20261016T001948 "), "2026-10-15T16:19:48.000Z");
  assert.equal(parseTaichungTime("2026-10-15 22:16:48"), "2026-10-15T14:16:48.000Z");
  assert.equal(parseTaichungTime("2026/10/15 22:16:48"), "2026-10-15T14:16:48.000Z");
});

test("parseTaichungTime: rejects anything that is not a real date and time", () => {
  for (const bad of ["", "not-a-time", "20261316T001948", "20260230T001948", "20261016T246000", "20261016T006100", "20261016", "20261016 001948", undefined, null]) {
    assert.equal(parseTaichungTime(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("taichungLiveAdapter: identity and source metadata the coverage table and the page attribution rely on", () => {
  assert.equal(taichungLiveAdapter.city, "taichung");
  assert.equal(taichungLiveAdapter.county, "臺中市");
  assert.equal(
    taichungLiveAdapter.endpoint,
    "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c923ad20-2ec6-43b9-b3ab-54527e99f7bc",
  );
  assert.equal(taichungLiveAdapter.datasetUrl, "https://data.gov.tw/dataset/83558");
  assert.match(taichungLiveAdapter.sourceLabel, /臺中市/);
  assert.equal(taichungLiveAdapter.parse, adaptTaichung);
  assert.ok(!JSON.stringify(taichungLiveAdapter).includes("全國"));
});

// --- the expired-position filter, end to end ------------------------------

const taichungDeps = (overrides = {}) => ({
  fetcher: async () => ({ status: 200, text: fixtureText }),
  now: () => T0,
  log: () => {},
  adapters: { taichung: taichungLiveAdapter },
  ...overrides,
});

test("through getLiveTrucks: fresh and stale rows are drawn (stale flagged); the 2025 row, month-old, hour-old and future-dated rows are hidden and counted", async () => {
  const result = await getLiveTrucks("taichung", taichungDeps());

  assert.equal(result.status, "ok");
  assert.equal(result.county, "臺中市");
  const byCar = Object.fromEntries(result.trucks.map((truck) => [truck.car, truck]));
  assert.deepEqual(Object.keys(byCar).sort(), ["850-UE", "KED-1385", "TST-1001", "TST-1002", "TST-1006", "TST-1007"]);

  assert.equal(byCar["KED-1385"].ageSeconds, 501); // 00:19:48 -> 00:28:09
  assert.equal(byCar["KED-1385"].stale, false);
  assert.equal(byCar["TST-1001"].stale, false);
  assert.equal(byCar["TST-1002"].stale, true, "25 minutes old (past 臺中's 20-minute fresh window): flagged, not hidden");
  assert.equal(byCar["TST-1006"].ageSeconds, 0, "under 2 minutes ahead of our clock is skew, never a negative age");
  assert.equal(byCar["TST-1007"].recordedAt, "2026-10-15T16:22:00.000Z");

  // 602-VP (2025-09-29), TST-1004 (last month), TST-1003 (88 minutes) are expired; TST-1005 claims 42 minutes ahead.
  assert.equal(result.hiddenCount, 4);
  for (const hidden of ["602-VP", "TST-1003", "TST-1004", "TST-1005"]) {
    assert.ok(!(hidden in byCar), `${hidden} must not be drawn`);
  }
});

test("through getLiveTrucks: trucks come back freshest first and no expired report sets the 'data as of' time", async () => {
  const result = await getLiveTrucks("taichung", taichungDeps());
  const ages = result.trucks.map((truck) => truck.ageSeconds);
  assert.deepEqual(ages, [...ages].sort((a, b) => a - b));
  assert.ok(result.trucks.every((truck) => truck.ageSeconds <= taichungLiveAdapter.freshness.expiredAfterSeconds));
  assert.ok(Date.parse(result.dataAsOf) >= Date.parse("2026-10-15T16:19:48Z"), "dataAsOf comes from a believable, recent report");
  assert.ok(Date.parse(result.dataAsOf) <= T0, "never later than the response time");
});

test("through getLiveTrucks: at a time when every report in the real rows is old, nothing is drawn but the count of hidden rows is honest", async () => {
  const realRowsOnly = JSON.stringify(JSON.parse(fixtureText).slice(0, 3));
  const twoHoursLater = T0 + 2 * 3_600_000;
  const result = await getLiveTrucks(
    "taichung",
    taichungDeps({ fetcher: async () => ({ status: 200, text: realRowsOnly }), now: () => twoHoursLater }),
  );
  assert.equal(result.status, "ok");
  assert.deepEqual(result.trucks, []);
  assert.equal(result.hiddenCount, 3);
});

// --- 臺中's own freshness window -------------------------------------------
// The feed refreshes about every 10 minutes (data.gov.tw: updateFrequency 10 分),
// and at 00:28 on 2026-10-16 only 113 of 663 rows were under 10 minutes old while
// 285 were 10-30 minutes old. Judging 臺中 by the shared 10-minute window would
// flag about two thirds of its trucks 「資料較舊」. So the adapter declares its own:
// fresh up to twice the update interval, hidden after four times it.

const taipeiCompact = (ms) => new Date(ms + 8 * 3_600_000).toISOString().replace(/[-:]/g, "").slice(0, 15);
const rowAged = (car, ageSeconds) => ({
  lineid: "30001",
  car,
  time: taipeiCompact(T0 - ageSeconds * 1000),
  location: "臺中市南屯區大墩路100號",
  X: "120.640000",
  Y: "24.140000",
  SpeedValue: "12",
  OverSpeed: "N",
});
const judgeAges = async (ages) => {
  const rows = ages.map((age) => rowAged(`AGE-${age}`, age));
  const result = await getLiveTrucks(
    "taichung",
    taichungDeps({ fetcher: async () => ({ status: 200, text: JSON.stringify(rows) }) }),
  );
  return Object.fromEntries(result.trucks.map((truck) => [truck.car, truck]).concat([["hidden", result.hiddenCount]]));
};

test("臺中 declares its own freshness window: fresh for twice the 10-minute update interval, hidden after at most 40 minutes", () => {
  const { freshMaxAgeSeconds, expiredAfterSeconds } = taichungLiveAdapter.freshness;
  assert.equal(freshMaxAgeSeconds, 20 * 60);
  assert.equal(expiredAfterSeconds, 40 * 60);
  assert.ok(freshMaxAgeSeconds >= 2 * 10 * 60, "at least twice the dataset's 10-minute update interval");
  assert.ok(expiredAfterSeconds > freshMaxAgeSeconds, "stale must be a real band between fresh and hidden");
  assert.ok(expiredAfterSeconds <= 60 * 60, "the hide threshold stays bounded");
});

test("through getLiveTrucks: a 臺中 truck reported 12 minutes ago is NOT flagged 資料較舊 (it would be under the shared 10-minute window)", async () => {
  const judged = await judgeAges([12 * 60]);
  assert.equal(judged["AGE-720"].stale, false);
  assert.equal(judged["AGE-720"].ageSeconds, 720);
  assert.equal(judged.hidden, 0);
});

test("through getLiveTrucks: 臺中 flags 資料較舊 only past 20 minutes (25 minutes ago is flagged, exactly 20 is not)", async () => {
  const judged = await judgeAges([20 * 60, 20 * 60 + 1, 25 * 60]);
  assert.equal(judged["AGE-1200"].stale, false, "exactly at the window is still fresh");
  assert.equal(judged["AGE-1201"].stale, true);
  assert.equal(judged["AGE-1500"].stale, true);
  assert.equal(judged.hidden, 0);
});

test("through getLiveTrucks: 臺中 hides reports older than the 40-minute cap and counts them (exactly 40 minutes is still drawn)", async () => {
  const judged = await judgeAges([40 * 60, 40 * 60 + 1, 41 * 60, 3 * 3600]);
  assert.equal(judged["AGE-2400"].stale, true, "exactly at the cap is drawn, flagged");
  for (const hiddenAge of ["AGE-2401", "AGE-2460", "AGE-10800"]) {
    assert.ok(!(hiddenAge in judged), `${hiddenAge} must not be drawn`);
  }
  assert.equal(judged.hidden, 3);
});

test("through getLiveTrucks: the response tells the page 臺中's own thresholds, so its wording matches what is drawn", async () => {
  const result = await getLiveTrucks("taichung", taichungDeps());
  assert.deepEqual(result.freshness, { freshMaxAgeSeconds: 20 * 60, expiredAfterSeconds: 40 * 60 });
  resetLiveTruckCacheForTests(); // the first call's snapshot would otherwise still be inside the cache window
  const down = await getLiveTrucks(
    "taichung",
    taichungDeps({ fetcher: async () => ({ status: 503, text: "" }) }),
  );
  assert.equal(down.status, "unavailable");
  assert.deepEqual(down.freshness, { freshMaxAgeSeconds: 20 * 60, expiredAfterSeconds: 40 * 60 });
});

test("through getLiveTrucks: a 臺中 report from the future is still invalid under the longer window (skew tolerance is shared, not widened)", async () => {
  const judged = await judgeAges([-60, -(10 * 60)]);
  assert.ok("AGE--60" in judged, "a minute ahead is clock skew");
  assert.ok(!("AGE--600" in judged), "ten minutes ahead is a bad record");
  assert.equal(judged.hidden, 1);
});

test("through getLiveTrucks: a non-JSON answer from 臺中 degrades that county ('bad_payload'), never 'no trucks'", async () => {
  const result = await getLiveTrucks(
    "taichung",
    taichungDeps({ fetcher: async () => ({ status: 200, text: "<html>Bad Gateway</html>" }) }),
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "bad_payload");
  assert.deepEqual(result.trucks, []);
});
