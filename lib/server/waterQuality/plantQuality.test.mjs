// Issue #676 (Track B B-14): 台水「水質資訊」淨水場檢驗結果 (data.gov.tw 6308,
// https://www.water.gov.tw/opendata/new_opendata_waterquality.csv) — a WIDE
// table: one row per 淨水場 (給水系統), one column per 檢驗項目, with header
// rows on top and footer notes below. parser + lookup helpers are pure
// functions, so nothing here touches MySQL or the network.
//
// The fixture is not hand-written: it is the real file's 4 header rows, 15
// hand-picked real data rows (the edge cases found in the full 154-row file —
// see the comments on each test) and its 3 footer rows, downloaded 2026-10-15.
// The full-file counts (154 rows, 68 items) are what the post-deploy
// verification checks live; they are not asserted against this trimmed sample.
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

const { parseWaterPlantQuality, WATER_PLANT_QUALITY_SOURCE_URL } = await import("./plantQuality.ts");
const {
  PLANT_QUALITY_DISCLAIMER,
  plantKey,
  parsePlantKey,
  isFailedPlant,
  summarizePlantQuality,
  listServiceAreas,
  filterPlants,
  formatSourceDate,
} = await import("./plantQualityLookup.ts");

const fixtureBuffer = readFileSync(
  fileURLToPath(new URL("./__fixtures__/new_opendata_waterquality-sample.csv", import.meta.url)),
);
const fixtureText = fixtureBuffer.toString("utf-8");
const parsed = parseWaterPlantQuality(fixtureText);
const { plants } = parsed;

const byName = (name) => {
  const plant = plants.find((p) => p.plantName === name);
  assert.ok(plant, `fixture plant ${name} not found`);
  return plant;
};

// The fixture's data lines, so synthetic variants can be derived from real rows.
const fixtureLines = fixtureText.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l !== "");
const HEADER_LINES = fixtureLines.slice(0, 4);
const FOOTER_LINES = fixtureLines.slice(-3);
const DATA_LINES = fixtureLines.slice(4, -3);

// ---------------------------------------------------------------- parser --

test("fixture really is the BOM-prefixed 4-header-row / 3-footer-row shape the upstream serves (guards the tests below from silently testing nothing)", () => {
  assert.deepEqual([...fixtureBuffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(HEADER_LINES.length, 4);
  assert.equal(DATA_LINES.length, 15);
  assert.match(FOOTER_LINES[0], /^更新日期：\d{4}\/\d{2}\/\d{2}/);
  assert.ok(FOOTER_LINES[1].startsWith("備註："));
  assert.ok(FOOTER_LINES[2].includes("台灣自來水公司供水轄區範圍為主"));
});

test("the source URL is the www.water.gov.tw file (same host as the live 停水公告 pipeline)", () => {
  assert.equal(WATER_PLANT_QUALITY_SOURCE_URL, "https://www.water.gov.tw/opendata/new_opendata_waterquality.csv");
});

test("parseWaterPlantQuality: skips the header rows and the footer notes — only the 15 real plants come back", () => {
  assert.equal(plants.length, 15);
  for (const plant of plants) {
    assert.ok(plant.plantName.endsWith("淨水場"), `${plant.plantName} does not look like a plant name`);
    assert.ok(!/更新日期|備註|飲用水水質標準|檢驗項目|單位/.test(plant.plantName));
  }
});

test("parseWaterPlantQuality: extracts the in-file 「更新日期：2026/09/23」 as an ISO date (not data.gov.tw's metadata date)", () => {
  assert.equal(parsed.sourceUpdatedOn, "2026-09-23");
});

test("parseWaterPlantQuality: the update date tolerates a half-width colon, spaces and single-digit month/day; garbage dates give null, not a throw", () => {
  const withFooter = (footer) => [...HEADER_LINES, DATA_LINES[0], footer].join("\n");
  assert.equal(parseWaterPlantQuality(withFooter("更新日期:2026/9/3")).sourceUpdatedOn, "2026-09-03");
  assert.equal(parseWaterPlantQuality(withFooter("更新日期： 2027 / 01 / 31")).sourceUpdatedOn, "2027-01-31");
  assert.equal(parseWaterPlantQuality(withFooter("更新日期：2026/13/40")).sourceUpdatedOn, null);
  assert.equal(parseWaterPlantQuality(withFooter("備註：")).sourceUpdatedOn, null);
  // A missing date does not stop the plants from parsing — the page just says the file carried no date.
  assert.equal(parseWaterPlantQuality(withFooter("備註：")).plants.length, 1);
});

test("parseWaterPlantQuality: maps the first real row (the one the issue's live check starts from)", () => {
  const plant = plants[0];
  assert.equal(plant.officeName, "一區");
  assert.equal(plant.officeCode, "0101");
  assert.equal(plant.plantCode, "0162030");
  assert.equal(plant.plantName, "新山淨水場");
  assert.equal(plant.plantNameEn, "Sinshan");
  assert.equal(plant.address, "基隆市麥金路720號");
  assert.equal(plant.serviceArea, "基隆市");
  assert.equal(plant.qualityPass, "Y");
});

test("parseWaterPlantQuality: the 區處代碼 loses the file's leading single quote ('0101 → 0101), and nothing else in any row keeps one", () => {
  assert.ok(fixtureText.includes(",'0101,"), "fixture should carry the quote-prefixed code");
  for (const plant of plants) {
    assert.ok(!plant.officeCode.startsWith("'"));
    assert.match(plant.officeCode, /^\d{4}$/);
    for (const item of plant.items) assert.ok(!item.value.startsWith("'"));
  }
});

test("parseWaterPlantQuality: a leading single quote is stripped from value cells too, but ND / <1 / －－ and the digits are left alone", () => {
  const line = DATA_LINES[0].replace(",150,ND,", ",'150,'ND,");
  const [plant] = parseWaterPlantQuality([...HEADER_LINES, line].join("\n")).plants;
  assert.equal(plant.items[0].value, "150");
  assert.equal(plant.items[1].value, "ND");
});

test("parseWaterPlantQuality: every plant carries the same 68 test items in the file's column order, with the standard and unit from the header rows", () => {
  for (const plant of plants) assert.equal(plant.items.length, 68);
  const items = plants[0].items;
  assert.deepEqual(items[0], {
    name: "總溶解固體量(Total Dissolved Solids)",
    standard: "500",
    unit: "mg/L",
    value: "150",
  });
  // Standards and units that are not a plain number are kept as the file spells them.
  const chlorine = items.find((i) => i.name.startsWith("自由有效餘氯"));
  assert.equal(chlorine.standard, "0.2-1.0");
  const ph = items.find((i) => i.name.startsWith("pH值"));
  assert.equal(ph.standard, "6.0-8.5");
  assert.equal(ph.unit, "－－");
  assert.equal(items.at(-1).name, "鹵乙酸類(Haloacetic acids)");
  assert.equal(items.at(-1).value, "0.0171");
  assert.equal(items.at(-1).standard, "0.06");
  assert.deepEqual(
    plants[1].items.map((i) => i.name),
    items.map((i) => i.name),
  );
});

test("parseWaterPlantQuality: ND, <1, <5 and －－ stay the original string — never 0, null or a number (spec §5 D-3)", () => {
  const first = plants[0].items;
  assert.equal(first[1].value, "ND"); // 亞硝酸鹽氮
  assert.equal(first[7].value, "<5"); // 色度
  assert.equal(first[8].value, "<1"); // 臭度
  const dashed = plants.flatMap((p) => p.items).filter((i) => i.value === "－－");
  assert.ok(dashed.length > 0, "fixture should include a data row with a －－ cell");
  for (const plant of plants) {
    for (const item of plant.items) assert.equal(typeof item.value, "string");
  }
  // And a numeric-looking value keeps its exact spelling (trailing zeros are information).
  const withTrailingZero = plants.flatMap((p) => p.items).find((i) => /^\d+\.\d*0$/.test(i.value));
  assert.ok(withTrailingZero, "fixture should include a value with a trailing zero");
  assert.match(withTrailingZero.value, /0$/);
});

test("parseWaterPlantQuality: a value shape this parser has never seen is kept verbatim rather than dropped or coerced", () => {
  const line = DATA_LINES[0].replace(",150,ND,", ",N/A,未檢測,");
  const [plant] = parseWaterPlantQuality([...HEADER_LINES, line].join("\n")).plants;
  assert.equal(plant.items[0].value, "N/A");
  assert.equal(plant.items[1].value, "未檢測");
});

test("parseWaterPlantQuality: the 水質合格否 column becomes qualityPass, not a 69th test item", () => {
  assert.ok(plants.every((p) => p.qualityPass === "Y"));
  for (const plant of plants) {
    assert.ok(!plant.items.some((i) => i.name.startsWith("水質合格否")));
  }
});

test("parseWaterPlantQuality: rows whose 水質合格否 is N are marked qualityPass N (lower-case n too); anything else is null, never silently Y", () => {
  const swapLast = (line, value) => line.replace(/,Y$/, `,${value}`);
  const result = parseWaterPlantQuality(
    [
      ...HEADER_LINES,
      swapLast(DATA_LINES[0], "N"),
      swapLast(DATA_LINES[1], "n"),
      swapLast(DATA_LINES[2], ""),
      swapLast(DATA_LINES[3], "待確認"),
      DATA_LINES[4],
      ...FOOTER_LINES,
    ].join("\n"),
  );
  assert.deepEqual(
    result.plants.map((p) => p.qualityPass),
    ["N", "N", null, null, "Y"],
  );
  assert.deepEqual(result.plants.map(isFailedPlant), [true, true, false, false, false]);
});

test("parseWaterPlantQuality: the 7-digit [plant code] is NOT unique in the real file (4 codes are shared by two plants) — (區處代碼, plant code) is, and that pair is the DB key", () => {
  assert.equal(new Set(plants.map((p) => p.plantCode)).size, 11, "4 shared codes → 15 rows, 11 distinct codes");
  assert.equal(new Set(plants.map(plantKey)).size, 15);
  const liouguei = byName("六龜淨水場");
  const sinwei = byName("新威淨水場");
  assert.equal(liouguei.plantCode, sinwei.plantCode);
  assert.notEqual(liouguei.officeCode, sinwei.officeCode);
  assert.deepEqual([liouguei.officeCode, sinwei.officeCode], ["0709", "0710"]);
});

test("parseWaterPlantQuality: plant codes with letters or a dash survive as written (0363011A3, 0561028-2)", () => {
  assert.equal(byName("寶山淨水場").plantCode, "0363011A3");
  assert.equal(byName("公園淨水場").plantCode, "0561028-2");
  assert.equal(byName("水上淨水場").plantCode, "0561037-2");
});

test("parseWaterPlantQuality: the <縣市@English> label in the name cell is kept as the file spells it — merged labels like 新竹縣市 / 嘉義縣市 included — and the English half is dropped", () => {
  assert.equal(byName("新山淨水場").serviceArea, "基隆市");
  assert.equal(byName("寶山淨水場").serviceArea, "新竹縣市");
  assert.equal(byName("公園淨水場").serviceArea, "嘉義縣市");
  assert.equal(byName("水上淨水場").serviceArea, "嘉義縣市");
  // The label is its own field, not the 區處 name ("一區") and not a prefix of the address.
  assert.equal(byName("公園淨水場").officeName, "五區");
  assert.match(byName("公園淨水場").address, /^嘉義市/);
  for (const plant of plants) assert.ok(!plant.serviceArea.includes("@"));
});

test("parseWaterPlantQuality: a row with a －－ cell in the data part (not just the header) is kept with that cell as the original string", () => {
  const pinglin = byName("坪林淨水場");
  assert.ok(pinglin.items.some((i) => i.value === "－－"));
});

test("parseWaterPlantQuality: does not depend on there being exactly 4 header rows — the 項次 number row can be absent (the issue says 3, the live file has 4)", () => {
  const threeHeaderRows = [...HEADER_LINES.slice(1), ...DATA_LINES, ...FOOTER_LINES].join("\n");
  const result = parseWaterPlantQuality(threeHeaderRows);
  assert.equal(result.plants.length, 15);
  assert.equal(result.plants[0].items[0].standard, "500");
  assert.equal(result.sourceUpdatedOn, "2026-09-23");
});

test("parseWaterPlantQuality: BOM + CRLF (what httpGetText hands back) parses identically to plain LF", () => {
  const crlf = `﻿${fixtureLines.join("\r\n")}\r\n`;
  assert.deepEqual(parseWaterPlantQuality(crlf), parsed);
});

test("parseWaterPlantQuality: a truncated last row (download cut off mid-line) is dropped, not stored with missing values", () => {
  const cutOff = DATA_LINES[1].split(",").slice(0, 40).join(",");
  const result = parseWaterPlantQuality([...HEADER_LINES, DATA_LINES[0], cutOff].join("\n"));
  assert.equal(result.plants.length, 1);
  assert.equal(result.plants[0].plantName, "新山淨水場");
});

test("parseWaterPlantQuality: a repeated (區處代碼, plant code) collapses to the last row so one DB key never gets two rows", () => {
  const changed = DATA_LINES[0].replace(",150,ND,", ",999,ND,");
  const result = parseWaterPlantQuality([...HEADER_LINES, DATA_LINES[0], changed].join("\n"));
  assert.equal(result.plants.length, 1);
  assert.equal(result.plants[0].items[0].value, "999");
});

test("parseWaterPlantQuality: empty text, a header-less CSV and an HTML error page served with HTTP 200 all give no plants (the sync treats that as a failed fetch)", () => {
  assert.deepEqual(parseWaterPlantQuality("").plants, []);
  assert.deepEqual(parseWaterPlantQuality("a,b,c\n1,2,3\n").plants, []);
  assert.deepEqual(parseWaterPlantQuality("<html><body>Service Unavailable</body></html>").plants, []);
  // Plant rows but no header row means the item names/standards are unknown → nothing usable.
  assert.deepEqual(parseWaterPlantQuality(DATA_LINES.join("\n")).plants, []);
});

// ---------------------------------------------------------------- lookup --

test("plantKey / parsePlantKey round-trip, including plant codes that contain a dash, and reject anything that is not a key", () => {
  const dashed = byName("公園淨水場");
  assert.equal(plantKey(dashed), "0501:0561028-2");
  assert.deepEqual(parsePlantKey("0501:0561028-2"), { officeCode: "0501", plantCode: "0561028-2" });
  assert.deepEqual(parsePlantKey(plantKey(plants[0])), { officeCode: "0101", plantCode: "0162030" });
  for (const bad of ["", "0101", ":0162030", "0101:", "0101:' OR 1=1 --", "abc:0162030", "0101:0162030:1", "0101:" + "9".repeat(40)]) {
    assert.equal(parsePlantKey(bad), null, `${JSON.stringify(bad)} must not parse`);
  }
});

test("summarizePlantQuality counts Y / N / unmarked separately; an unmarked plant is never counted as passed", () => {
  const sample = [
    { qualityPass: "Y" },
    { qualityPass: "Y" },
    { qualityPass: "N" },
    { qualityPass: null },
  ];
  assert.deepEqual(summarizePlantQuality(sample), { total: 4, passed: 2, failed: 1, unmarked: 1 });
  assert.deepEqual(summarizePlantQuality([]), { total: 0, passed: 0, failed: 0, unmarked: 0 });
});

test("listServiceAreas: distinct labels in the order they first appear in the file", () => {
  assert.deepEqual(listServiceAreas(plants), ["基隆市", "新北市", "新竹縣市", "嘉義縣市", "高雄市", "屏東縣", "臺東縣"]);
});

test("filterPlants: by service area, by name/address/English-name text (case-insensitive), and by N-only; combined filters intersect", () => {
  assert.equal(filterPlants(plants, {}).length, 15);
  assert.deepEqual(filterPlants(plants, { serviceArea: "嘉義縣市" }).map((p) => p.plantName), ["公園淨水場", "水上淨水場"]);
  assert.deepEqual(filterPlants(plants, { query: "六龜" }).map((p) => p.plantName), ["六龜淨水場", "新威淨水場"]);
  assert.deepEqual(filterPlants(plants, { query: "  sinshan " }).map((p) => p.plantName), ["新山淨水場"]);
  assert.deepEqual(filterPlants(plants, { query: "瑞芳區" }).map((p) => p.plantName), ["員山淨水場"]);
  assert.deepEqual(filterPlants(plants, { serviceArea: "嘉義縣市", query: "水上" }).map((p) => p.plantName), ["水上淨水場"]);
  assert.deepEqual(filterPlants(plants, { failedOnly: true }), []);
  assert.deepEqual(filterPlants(plants, { query: "no-such-plant" }), []);
});

test("filterPlants: plants marked N come first (so the prominent marker is the first thing seen) and the rest keep file order", () => {
  const sample = [
    { plantName: "甲", qualityPass: "Y" },
    { plantName: "乙", qualityPass: "N" },
    { plantName: "丙", qualityPass: null },
    { plantName: "丁", qualityPass: "N" },
  ];
  assert.deepEqual(filterPlants(sample, {}).map((p) => p.plantName), ["乙", "丁", "甲", "丙"]);
  assert.deepEqual(filterPlants(sample, { failedOnly: true }).map((p) => p.plantName), ["乙", "丁"]);
});

test("formatSourceDate shows the file's own date spelling (2026-09-23 → 2026/09/23) and returns null for nothing or garbage", () => {
  assert.equal(formatSourceDate("2026-09-23"), "2026/09/23");
  assert.equal(formatSourceDate(null), null);
  assert.equal(formatSourceDate(""), null);
  assert.equal(formatSourceDate("not a date"), null);
});

test("the page disclaimer says the figures are 台水's published data, not this site's judgement", () => {
  assert.match(PLANT_QUALITY_DISCLAIMER, /台灣自來水公司/);
  assert.match(PLANT_QUALITY_DISCLAIMER, /非本站判定/);
});
