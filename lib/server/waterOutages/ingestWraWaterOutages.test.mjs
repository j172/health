import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

process.env.MYSQL_HOST = "localhost";
process.env.MYSQL_USER = "test";
process.env.MYSQL_PASSWORD = "test";
process.env.MYSQL_DATABASE = "test";
process.env.RSS_SYNC_ADMIN_SECRET = "test";

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { parseWraCsv } = await import("../water/wraCsvParser.ts");
const { mapWraCsvRecordToOutage } = await import("./ingestWraWaterOutages.ts");

// Real header + row shape confirmed live against
// https://web.water.gov.tw/wateroffapi/openData/export/csv-utf8 on 2026-09-20
// (see docs/specs/water-outages-live-ingestion-gap.md) — the JSON endpoint's
// field set is a subset of this, so this repo standardizes on the CSV one.
const REAL_CSV_HEADER =
  "案件編號,區處,廠所,連絡電話,案件日期時間,恢復日期時間,屬性,定時案件,停水類型,案件時長(小時),停水戶數,影響縣市,影響行政區,停水地區,停水原因,降壓戶數,降壓地區,降壓原因,影響戶數";

const REAL_CSV_ROW =
  "202609190039,第二區管理處,龜山服務所,033294899,2026-09-19 14:00:00,2026-09-20 01:00:00,非計畫性,否,破管搶修,11.0,155,桃園市,龜山區,桃園市/龜山區/萬壽路二段、永和街、金福街、陸光路。,[因龜山區萬壽路二段938號前 300mmDIP污水挖損漏水搶修。],0,null,[],155";

test("parseWraCsv parses the real WRA CSV shape into header-keyed records", () => {
  const records = parseWraCsv(`${REAL_CSV_HEADER}\n${REAL_CSV_ROW}\n`);
  assert.equal(records.length, 1);
  assert.equal(records[0]["案件編號"], "202609190039");
  assert.equal(records[0]["影響縣市"], "桃園市");
  assert.equal(records[0]["影響行政區"], "龜山區");
  assert.equal(records[0]["停水戶數"], "155");
  assert.equal(records[0]["案件日期時間"], "2026-09-19 14:00:00");
  assert.equal(records[0]["恢復日期時間"], "2026-09-20 01:00:00");
});

test("parseWraCsv handles quoted cells containing commas and escaped quotes", () => {
  const csv = `a,b,c\n"1,000","she said ""hi""",plain\n`;
  const records = parseWraCsv(csv);
  assert.equal(records.length, 1);
  assert.equal(records[0].a, "1,000");
  assert.equal(records[0].b, 'she said "hi"');
  assert.equal(records[0].c, "plain");
});

test("mapWraCsvRecordToOutage maps a real-shaped row's fields correctly", () => {
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${REAL_CSV_ROW}\n`);
  const nowMs = new Date("2026-09-19T10:00:00Z").getTime(); // 2026-09-19 18:00 Taipei — inside the window
  const mapped = mapWraCsvRecordToOutage(record, 0, nowMs);

  assert.ok(mapped);
  assert.equal(mapped.outageId, "WRA-202609190039");
  assert.equal(mapped.county, "桃園市");
  assert.equal(mapped.township, "龜山區");
  assert.equal(mapped.outageType, "emergency"); // 屬性 = 非計畫性
  assert.equal(mapped.startTime, "2026-09-19 14:00:00");
  assert.equal(mapped.endTime, "2026-09-20 01:00:00");
  assert.equal(mapped.affectedHouseholds, 155);
  assert.equal(mapped.contactPhone, "033294899");
  assert.equal(mapped.status, "active");
  assert.ok(mapped.title.includes("桃園市龜山區"));
  assert.ok(mapped.affectedAreas.includes("龜山區"));
  assert.equal(mapped.source, "第二區管理處龜山服務所");
});

test("mapWraCsvRecordToOutage derives scheduled/resolved status from start/end vs now", () => {
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${REAL_CSV_ROW}\n`);

  const beforeStart = mapWraCsvRecordToOutage(
    record,
    0,
    new Date("2026-09-19T00:00:00Z").getTime(), // 08:00 Taipei, before 14:00 start
  );
  assert.equal(beforeStart.status, "scheduled");

  const afterEnd = mapWraCsvRecordToOutage(
    record,
    0,
    new Date("2026-09-19T20:00:00Z").getTime(), // 2026-09-20 04:00 Taipei, after the 01:00 end
  );
  assert.equal(afterEnd.status, "resolved");
});

test("mapWraCsvRecordToOutage falls back to start+24h when 恢復日期時間 is blank/\"null\"", () => {
  const rowWithNoEndTime = REAL_CSV_ROW.replace("2026-09-20 01:00:00", "null");
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${rowWithNoEndTime}\n`);
  const nowMs = new Date("2026-09-19T10:00:00Z").getTime();
  const mapped = mapWraCsvRecordToOutage(record, 0, nowMs);

  assert.ok(mapped);
  assert.equal(mapped.startTime, "2026-09-19 14:00:00");
  assert.equal(mapped.endTime, "2026-09-20 14:00:00"); // start + 24h, still Taipei wall-clock
});

test("mapWraCsvRecordToOutage treats 屬性=計畫性 as a planned outage", () => {
  const plannedRow = REAL_CSV_ROW.replace("非計畫性", "計畫性").replace("破管搶修", "配管工程");
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${plannedRow}\n`);
  const mapped = mapWraCsvRecordToOutage(record, 0, Date.now());
  assert.ok(mapped);
  assert.equal(mapped.outageType, "planned");
});

test("mapWraCsvRecordToOutage returns null when the affected county is missing", () => {
  const rowWithNoCounty = REAL_CSV_ROW.replace(",桃園市,", ",,");
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${rowWithNoCounty}\n`);
  assert.equal(mapWraCsvRecordToOutage(record, 0, Date.now()), null);
});

test("mapWraCsvRecordToOutage returns null when the start time is missing/unparseable", () => {
  const rowWithNoStart = REAL_CSV_ROW.replace("2026-09-19 14:00:00", "null");
  const [record] = parseWraCsv(`${REAL_CSV_HEADER}\n${rowWithNoStart}\n`);
  assert.equal(mapWraCsvRecordToOutage(record, 0, Date.now()), null);
});
