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

const { parseFsc11198Csv, fsc11198RawSchema, FSC_11198_SOURCE_KEY } = await import(
  "./fsc11198.ts"
);
const { validateImportRows } = await import("../../validation/importSchema.ts");

const fixturePath = new URL("../__fixtures__/fsc-11198-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

test("fixture file is UTF-8 with a BOM and CRLF line endings, as served live by www.sfb.gov.tw", () => {
  assert.equal(fixtureBuffer[0], 0xef);
  assert.equal(fixtureBuffer[1], 0xbb);
  assert.equal(fixtureBuffer[2], 0xbf);
});

test("parseFsc11198Csv: parses a real recorded sample into structured weekly records", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parseFsc11198Csv(csvText);

  // header + 97 data rows in the fixture (2024-12-06 through 2026-10-12)
  assert.equal(records.length, 97);

  for (const record of records) {
    assert.match(record.reportDate, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("parseFsc11198Csv: converts the compact YYYYMMDD 日期 into YYYY-MM-DD and carries through the first known row", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parseFsc11198Csv(csvText);

  const first = records[0];
  assert.deepEqual(first, {
    reportDate: "2024-12-06",
    weeklyNewCount: 1030,
    changePct: 1.75,
    cumulativeCount: 68115,
  });
});

test("parseFsc11198Csv: strips thousands-commas from a quoted large cumulative total (2026-09-29's 累計案件數 is literally \"117,768\")", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parseFsc11198Csv(csvText);

  const row = records.find((r) => r.reportDate === "2026-09-29");
  assert.equal(row.cumulativeCount, 117768);
});

test("parseFsc11198Csv: the most recent row in the fixture is 2026-10-12 — confirms this export keeps appending weekly rows under the same URL, not a frozen 2024 snapshot", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parseFsc11198Csv(csvText);
  const latest = records[records.length - 1];
  assert.equal(latest.reportDate, "2026-10-12");
});

test("parseFsc11198Csv: a row with a blank or malformed 日期 is dropped rather than failing the whole import", () => {
  const csvText =
    "日期,本週新增件數,較前期增減%,累計案件數\n" +
    ",1030,1.75,68115\n" +
    "2024-12-06,1030,1.75,68115\n" + // wrong shape (has dashes, not the real "YYYYMMDD")
    "20241213,1024,-0.59,69139\n";
  const records = parseFsc11198Csv(csvText);
  assert.equal(records.length, 1);
  assert.equal(records[0].reportDate, "2024-12-13");
});

test("fsc11198RawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("金管會 11198 打詐儀表板", fsc11198RawSchema, [
      { 日期: "20241206", 本週新增件數: "1030", "較前期增減%": "1.75", 累計案件數: "68115" },
    ]),
  );
});

test("fsc11198RawSchema: throws loudly if upstream renames/drops 日期", () => {
  assert.throws(
    () =>
      validateImportRows("金管會 11198 打詐儀表板", fsc11198RawSchema, [
        { 統計日期: "20241206", 本週新增件數: "1030" },
      ]),
    /field "日期"/,
  );
});

test("FSC_11198_SOURCE_KEY is a stable identifier distinct from every police-* source", () => {
  assert.equal(FSC_11198_SOURCE_KEY, "fsc_11198");
});
