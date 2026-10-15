// Issue #674 (B-16): parser for 新北市垃圾車清運路線 (data.gov.tw 125664).
// The fixture is real records copied from the live CSV on 2026-10-15, chosen
// to cover: a plain route, a quoted route name containing a space, the three
// kinds of embedded newlines the live file really has (inside a quoted memo,
// stop name, and stop name+note), a Thursday-only route, and a memo value.
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

const { parseNtpcRoutes, NTPC_125664_SOURCE_KEY } = await import("./ntpc125664.ts");

const fixtureText = readFileSync(new URL("../__fixtures__/ntpc-125664-sample.csv", import.meta.url), "utf-8");

test("parseNtpcRoutes: every logical record becomes one stop (embedded newlines do not split records), tagged city=new_taipei", () => {
  const records = parseNtpcRoutes(fixtureText);
  assert.equal(records.length, 12);
  assert.ok(records.every((r) => r.city === "new_taipei"));
  assert.equal(NTPC_125664_SOURCE_KEY, "garbage_ntpc_125664");
});

test("parseNtpcRoutes: first row maps every column; the 21 Y flags become three weekday sets", () => {
  const [first] = parseNtpcRoutes(fixtureText);
  assert.deepEqual(first, {
    city: "new_taipei",
    lineId: "207001",
    stopRank: 1,
    lineName: "A路線下午",
    tripLabel: null,
    team: null,
    district: "萬里區",
    village: "萬里里",
    stopName: "獅頭路15-1號(海巡)",
    lat: 25.17950406,
    lng: 121.6945286,
    arriveTime: "12:40",
    departTime: null,
    // 一般垃圾 Mon/Tue/Thu/Fri/Sat, 資源回收 Mon/Thu, 廚餘 Mon/Tue/Thu/Fri/Sat (bit 0 = Sunday)
    garbageDays: 2 + 4 + 16 + 32 + 64,
    recyclingDays: 2 + 16,
    foodscrapsDays: 2 + 4 + 16 + 32 + 64,
    memo: null,
  });
});

test("parseNtpcRoutes: a quoted route name keeps its internal space; a memo is carried through", () => {
  const records = parseNtpcRoutes(fixtureText);
  const jinshan = records.filter((r) => r.lineId === "208001");
  assert.equal(jinshan.length, 3);
  assert.equal(jinshan[0].lineName, "金山1路線 晚上1");
  assert.equal(jinshan[0].memo, "2025通報");
  assert.equal(jinshan[1].memo, null);
  assert.deepEqual(jinshan.map((r) => r.stopRank), [1, 2, 3]);
});

test("parseNtpcRoutes: newlines embedded inside quoted stop names are collapsed away, not kept as line breaks", () => {
  const records = parseNtpcRoutes(fixtureText);
  const names = records.map((r) => r.stopName);
  assert.ok(names.includes("中央路2段61巷34弄口、61巷44弄口"), names.join(" | "));
  assert.ok(names.includes("和平路57號(路牌下收運後迴轉)"), names.join(" | "));
  for (const record of records) {
    assert.ok(!/[\r\n]/.test(record.stopName), `${record.stopName} still has a line break`);
    assert.ok(record.memo === null || !/[\r\n]/.test(record.memo));
  }
});

test("parseNtpcRoutes: a memo that is only a newline counts as no memo", () => {
  const records = parseNtpcRoutes(fixtureText);
  const row = records.find((r) => r.lineId === "236017" && r.stopRank === 64);
  assert.ok(row, "236017 rank 64 must be present");
  assert.equal(row.memo, null);
  assert.equal(row.stopName, "和城路2段255巷31號");
});

test("parseNtpcRoutes: a route that only runs on Thursday maps to bit 4 for all three kinds", () => {
  const records = parseNtpcRoutes(fixtureText);
  const sanzhi = records.filter((r) => r.lineId === "252005");
  assert.equal(sanzhi.length, 2);
  for (const record of sanzhi) {
    assert.equal(record.garbageDays, 16);
    assert.equal(record.recyclingDays, 16);
    assert.equal(record.foodscrapsDays, 16);
  }
});

test("parseNtpcRoutes: coordinates with many decimals parse as plain numbers", () => {
  const records = parseNtpcRoutes(fixtureText);
  const row = records.find((r) => r.lineId === "252005" && r.stopRank === 4);
  assert.equal(row.lat, 25.220696403253864);
  assert.equal(row.lng, 121.52853840521675);
});

test("parseNtpcRoutes: (city, line_id, stop_rank) is unique; a duplicate key later in the file is dropped, first one wins", () => {
  const records = parseNtpcRoutes(fixtureText);
  const keys = records.map((r) => `${r.city}|${r.lineId}|${r.stopRank}`);
  assert.equal(new Set(keys).size, keys.length);

  const header = fixtureText.split("\n")[0];
  const dupCsv = [
    header,
    "萬里區,207001,A路線下午,1,第一個,萬里里,121.69,25.17,12:40,,,Y,,,,,,,,,,,,,,,,,,",
    "萬里區,207001,A路線下午,1,第二個,萬里里,121.69,25.17,12:41,,,Y,,,,,,,,,,,,,,,,,,",
  ].join("\n");
  const deduped = parseNtpcRoutes(dupCsv);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].stopName, "第一個");
});

test("parseNtpcRoutes: rows with missing/invalid coordinates, no line id, or a non-numeric rank are skipped", () => {
  const header = fixtureText.split("\n")[0];
  const flags = ",,,Y,,,,,,,,,,,,,,,,,,";
  const csv = [
    header,
    `萬里區,207001,A路線下午,1,甲,萬里里,121.69,25.17,12:40${flags}`,
    `萬里區,207001,A路線下午,2,乙,萬里里,,,12:41${flags}`,
    `萬里區,207001,A路線下午,3,丙,萬里里,0,0,12:42${flags}`,
    `萬里區,,A路線下午,4,丁,萬里里,121.69,25.17,12:43${flags}`,
    `萬里區,207001,A路線下午,x,戊,萬里里,121.69,25.17,12:44${flags}`,
    `萬里區,207001,A路線下午,6,,萬里里,121.69,25.17,12:45${flags}`,
  ].join("\n");
  assert.deepEqual(parseNtpcRoutes(csv).map((r) => r.stopName), ["甲"]);
});

test("parseNtpcRoutes: a row with no Y flag at all keeps empty (0) day sets rather than null — the source did give flags", () => {
  const header = fixtureText.split("\n")[0];
  const csv = [header, "萬里區,207001,A路線下午,1,甲,萬里里,121.69,25.17,12:40,,,,,,,,,,,,,,,,,,,,,,"].join("\n");
  const [record] = parseNtpcRoutes(csv);
  assert.equal(record.garbageDays, 0);
  assert.equal(record.recyclingDays, 0);
  assert.equal(record.foodscrapsDays, 0);
});

test("parseNtpcRoutes: empty text, or a header-only file, yields an empty list", () => {
  assert.deepEqual(parseNtpcRoutes(""), []);
  assert.deepEqual(parseNtpcRoutes(fixtureText.split("\n")[0] + "\n"), []);
});

test("parseNtpcRoutes: a response that is not this CSV throws instead of silently returning nothing", () => {
  assert.throws(() => parseNtpcRoutes("<html><body>Request Rejected</body></html>"), /125664/);
  assert.throws(() => parseNtpcRoutes("a,b,c\n1,2,3\n"), /125664/);
});
