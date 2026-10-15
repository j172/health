// Issue #674 (B-16): parser for 臺北市垃圾車路線與清運點 (data.gov.tw 136515).
// The fixture is real rows copied from the live CSV on 2026-10-15 (header,
// 天母-1 第1/2車, 文林-2 第2/3車 including 24:xx after-midnight arrivals, and the
// 石牌-3／光明-4 block where two routes' rows are interleaved in the file).
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

const { parseTaipeiRoutes, TAIPEI_136515_SOURCE_KEY } = await import("./taipei136515.ts");

const fixtureText = readFileSync(new URL("../__fixtures__/taipei-136515-sample.csv", import.meta.url), "utf-8");

test("fixture is UTF-8 with a BOM, as served live by data.taipei", () => {
  assert.equal(fixtureText.charCodeAt(0), 0xfeff);
});

test("parseTaipeiRoutes: every fixture data row becomes one stop, all tagged city=taipei", () => {
  const records = parseTaipeiRoutes(fixtureText);
  assert.equal(records.length, 27);
  assert.ok(records.every((r) => r.city === "taipei"));
  assert.equal(TAIPEI_136515_SOURCE_KEY, "garbage_taipei_136515");
});

test("parseTaipeiRoutes: first row maps every column, 1630 -> 16:30, no weekday info in this dataset", () => {
  const [first] = parseTaipeiRoutes(fixtureText);
  assert.deepEqual(first, {
    city: "taipei",
    lineId: "103-074:天母-1:第1車",
    stopRank: 1,
    lineName: "天母-1",
    tripLabel: "第1車",
    team: "天母分隊",
    district: "士林區",
    village: "天壽里",
    stopName: "臺北市士林區天母西路48號",
    lat: 25.11836,
    lng: 121.525,
    arriveTime: "16:30",
    departTime: "16:40",
    garbageDays: null,
    recyclingDays: null,
    foodscrapsDays: null,
    memo: null,
  });
});

test("parseTaipeiRoutes: one trip = (局編, 路線, 車次); stop_rank counts 1..n inside each trip", () => {
  const records = parseTaipeiRoutes(fixtureText);
  const tianmu1 = records.filter((r) => r.lineId === "103-074:天母-1:第1車");
  assert.deepEqual(tianmu1.map((r) => r.stopRank), [1, 2, 3, 4, 5]);
  const tianmu2 = records.filter((r) => r.lineId === "103-074:天母-1:第2車");
  assert.deepEqual(tianmu2.map((r) => r.stopRank), [1, 2, 3, 4]);
});

test("parseTaipeiRoutes: (city, line_id, stop_rank) is unique across the whole sample — the table's UNIQUE KEY cannot collide", () => {
  const records = parseTaipeiRoutes(fixtureText);
  const keys = records.map((r) => `${r.city}|${r.lineId}|${r.stopRank}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("parseTaipeiRoutes: after-midnight arrivals (2410, 2411, 2417) are kept as hour>=24 clock strings", () => {
  const records = parseTaipeiRoutes(fixtureText);
  const trip = records.filter((r) => r.lineId === "102-057:文林-2:第3車");
  assert.deepEqual(
    trip.map((r) => r.arriveTime),
    ["23:50", "24:11", "24:17"],
  );
  assert.deepEqual(
    trip.map((r) => r.departTime),
    ["24:10", "24:13", "24:20"],
  );
});

test("parseTaipeiRoutes: interleaved rows of two routes stay with their own trip, ranked by arrival time not file position", () => {
  const records = parseTaipeiRoutes(fixtureText);
  const shipai3 = records.filter((r) => r.lineId === "111-G05:石牌-3:第3車");
  // In the file, 石牌-3 第3車's 2207 row comes AFTER a 光明-4 row and is separated
  // from its 2132/2151/2201 siblings; it must still be that trip's stop #4.
  assert.deepEqual(shipai3.map((r) => r.arriveTime), ["21:32", "21:51", "22:01", "22:07"]);
  assert.deepEqual(shipai3.map((r) => r.stopRank), [1, 2, 3, 4]);

  const guangming4 = records.filter((r) => r.lineId === "111-G13:光明-4:第1車");
  assert.deepEqual(guangming4.map((r) => r.arriveTime), ["16:20", "17:30", "17:34", "17:37", "17:41"]);
  assert.deepEqual(guangming4.map((r) => r.stopRank), [1, 2, 3, 4, 5]);
});

test("parseTaipeiRoutes: stop names are kept verbatim, including the source's own '?' placeholder for a rare character", () => {
  const records = parseTaipeiRoutes(fixtureText);
  assert.ok(records.some((r) => r.stopName === "臺北市北投區公?路423巷口"));
});

test("parseTaipeiRoutes: rows without usable coordinates are skipped rather than stored with 0,0", () => {
  const csv = [
    "行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1630,1640,甲地,121.525,25.11836",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1641,1651,乙地,,",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1652,1700,丙地,abc,def",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1701,1710,丁地,0,0",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1711,1720,戊地,12.5,25.1",
  ].join("\n");
  const records = parseTaipeiRoutes(csv);
  assert.deepEqual(records.map((r) => r.stopName), ["甲地"]);
});

test("parseTaipeiRoutes: a coordinate cell with a stray space and trailing comma (a real 舊莊-2 row) is repaired, not dropped", () => {
  const csv = [
    "行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度",
    '南港區,九如里,舊莊分隊,111-G07,KEJ-0573,舊莊-2,第2車,1951,2000,臺北市南港區研究院路3段2巷16號對面,121.6160628," 25.036617734018307,"',
  ].join("\n");
  const [record] = parseTaipeiRoutes(csv);
  assert.equal(record.lat, 25.036617734018307);
  assert.equal(record.lng, 121.6160628);
});

test("parseTaipeiRoutes: quoted stop names that contain commas stay in one cell", () => {
  const csv = [
    "行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度",
    '北投區,泉源里,陽明分隊,110-G17,KEJ-6185,陽明-2,第1車,1703,1705,"臺北市北投區登山路25之1號(每週二,五回收車)",121.50875,25.14815',
  ].join("\n");
  const [record] = parseTaipeiRoutes(csv);
  assert.equal(record.stopName, "臺北市北投區登山路25之1號(每週二,五回收車)");
});

test("parseTaipeiRoutes: rows missing the route name or the stop name are skipped", () => {
  const csv = [
    "行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度",
    "士林區,天壽里,天母分隊,103-074,821-BT,,第1車,1630,1640,甲地,121.525,25.11836",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1641,1651,,121.525,25.11836",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,1652,1700,丙地,121.525,25.11836",
  ].join("\n");
  assert.deepEqual(parseTaipeiRoutes(csv).map((r) => r.stopName), ["丙地"]);
});

test("parseTaipeiRoutes: an unparseable arrival time keeps the stop (time is not part of the key) with a null time", () => {
  const csv = [
    "行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度",
    "士林區,天壽里,天母分隊,103-074,821-BT,天母-1,第1車,,,甲地,121.525,25.11836",
  ].join("\n");
  const [record] = parseTaipeiRoutes(csv);
  assert.equal(record.arriveTime, null);
  assert.equal(record.departTime, null);
  assert.equal(record.stopRank, 1);
});

test("parseTaipeiRoutes: empty text, or a header-only file, yields an empty list", () => {
  assert.deepEqual(parseTaipeiRoutes(""), []);
  assert.deepEqual(
    parseTaipeiRoutes("行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度\n"),
    [],
  );
});

test("parseTaipeiRoutes: a response that is not this CSV (HTML error page, renamed columns) throws instead of silently returning nothing", () => {
  assert.throws(() => parseTaipeiRoutes("<html><body>Request Rejected</body></html>"), /136515/);
  assert.throws(() => parseTaipeiRoutes("a,b,c\n1,2,3\n"), /136515/);
});
