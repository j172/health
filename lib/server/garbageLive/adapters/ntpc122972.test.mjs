// Issue #679 (B-17): adapter for 新北市垃圾車即時位置 (data.gov.tw 122972).
// The fixture's first row is a real record fetched from the public dataset on
// 2026-10-16 00:07 (+08:00); the TST-xxxx rows are synthetic but follow the live
// shape and cover the edge cases: a vehicle reported twice, a row without
// coordinates, coordinates in Taichung, an unparseable time, a quoted location
// containing a comma, an old report, a row with no plate, and two reports whose
// time is ahead of the clock the freshness tests use.
import test from "node:test";
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

const { adaptNtpc, ntpcLiveAdapter } = await import("./ntpc122972.ts");
const { parseTaipeiLocalTime } = await import("./shared.ts");

const fixtureText = readFileSync(new URL("../__fixtures__/ntpc-122972-sample.csv", import.meta.url), "utf-8");

test("adaptNtpc: keeps only usable, in-county rows — one position per vehicle (the newest report wins)", () => {
  const positions = adaptNtpc(fixtureText);
  assert.deepEqual(
    positions.map((p) => p.car).sort(),
    ["KEV-0028", "TST-0002", "TST-0006", "TST-0007", "TST-0009", "TST-0010"],
  );
  // TST-0002 appears twice (22:47:10 and 22:30:00): the later report is the one kept.
  const doubled = positions.find((p) => p.car === "TST-0002");
  assert.equal(doubled.recordedAt, "2026-10-15T14:47:10.000Z");
  assert.equal(doubled.location, "新北市板橋區文化路一段100號");
});

test("adaptNtpc: maps the real row's columns, converting the Taipei wall-clock time to a UTC instant", () => {
  const real = adaptNtpc(fixtureText).find((p) => p.car === "KEV-0028");
  assert.deepEqual(real, {
    lineId: "251010",
    car: "KEV-0028",
    lat: 25.1812683333333,
    lng: 121.41923,
    location: "新北市淡水區中正路一段87巷8弄31-1號",
    district: "淡水區",
    // 2026/10/15 22:48:51 in Asia/Taipei (UTC+8)
    recordedAt: "2026-10-15T14:48:51.000Z",
  });
});

test("adaptNtpc: drops rows with no coordinates, no plate, an unparseable time, or coordinates outside 新北市", () => {
  const cars = new Set(adaptNtpc(fixtureText).map((p) => p.car));
  assert.ok(!cars.has("TST-0003"), "no coordinates");
  assert.ok(!cars.has("TST-0004"), "coordinates are in 臺中市");
  assert.ok(!cars.has("TST-0005"), "time is not a time");
  assert.ok(!cars.has(""), "no plate");
});

test("adaptNtpc: a quoted location that contains a comma stays in one piece", () => {
  const row = adaptNtpc(fixtureText).find((p) => p.car === "TST-0006");
  assert.equal(row.location, "新北市中和區景平路,近某路口");
});

test("adaptNtpc does not judge freshness: an old report and one 'from the future' are still parsed (getLiveTrucks decides, per request)", () => {
  const byCar = Object.fromEntries(adaptNtpc(fixtureText).map((p) => [p.car, p]));
  assert.equal(byCar["TST-0007"].recordedAt, "2026-10-13T23:15:00.000Z");
  assert.equal(byCar["TST-0010"].recordedAt, "2026-10-15T15:30:00.000Z");
});

test("adaptNtpc: a header-only file is an honest 'no trucks reporting' (empty list), not an error", () => {
  assert.deepEqual(adaptNtpc("lineid,car,time,location,longitude,latitude,cityid,cityname\n"), []);
});

test("adaptNtpc: an empty body or a non-CSV page throws, so the county degrades instead of showing 'no trucks'", () => {
  assert.throws(() => adaptNtpc(""), /empty/i);
  assert.throws(() => adaptNtpc("<html><body>Service Unavailable</body></html>"), /unexpected CSV header/);
  assert.throws(() => adaptNtpc("lineid,time,location,longitude,latitude\n1,2,3,4,5\n"), /missing column/);
});

test("adaptNtpc tolerates the BOM the live file starts with", () => {
  assert.ok(fixtureText.charCodeAt(0) === 0xfeff, "fixture should keep the live file's BOM");
  assert.ok(adaptNtpc(fixtureText).length > 0);
});

test("ntpcLiveAdapter: identity and source metadata the coverage table and the page attribution rely on", () => {
  assert.equal(ntpcLiveAdapter.city, "new_taipei");
  assert.equal(ntpcLiveAdapter.county, "新北市");
  assert.equal(
    ntpcLiveAdapter.endpoint,
    "https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/csv/file",
  );
  assert.equal(ntpcLiveAdapter.datasetUrl, "https://data.gov.tw/dataset/122972");
  assert.match(ntpcLiveAdapter.sourceLabel, /新北市/);
  assert.equal(ntpcLiveAdapter.parse, adaptNtpc);
  assert.ok(!JSON.stringify(ntpcLiveAdapter).includes("全國"));
});

test("parseTaipeiLocalTime: slash, dash and T-separated wall-clock forms all read as Asia/Taipei", () => {
  const expected = "2026-10-15T14:48:51.000Z";
  assert.equal(parseTaipeiLocalTime("2026/10/15 22:48:51"), expected);
  assert.equal(parseTaipeiLocalTime("2026-10-15 22:48:51"), expected);
  assert.equal(parseTaipeiLocalTime("2026-10-15T22:48:51"), expected);
  assert.equal(parseTaipeiLocalTime("  2026/10/15 22:48:51  "), expected);
  assert.equal(parseTaipeiLocalTime("2026/10/15 22:48"), "2026-10-15T14:48:00.000Z");
  // An early-morning Taipei time falls on the previous UTC day.
  assert.equal(parseTaipeiLocalTime("2026/10/16 03:00:00"), "2026-10-15T19:00:00.000Z");
});

test("parseTaipeiLocalTime: rejects anything that is not a real date and time", () => {
  for (const bad of ["", "not-a-time", "2026/13/01 00:00:00", "2026/02/30 10:00:00", "2026/10/15 24:30:00", "2026/10/15 10:61:00", undefined, null]) {
    assert.equal(parseTaipeiLocalTime(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});
