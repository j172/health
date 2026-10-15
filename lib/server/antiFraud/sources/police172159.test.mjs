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

const { parsePolice172159Csv, police172159RawSchema, POLICE_172159_SOURCE_KEY } = await import(
  "./police172159.ts"
);
const { validateImportRows } = await import("../../validation/importSchema.ts");

const fixturePath = new URL("../__fixtures__/police-172159-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

test("fixture file is UTF-8 with a BOM, as served live by opdadm.moi.gov.tw", () => {
  assert.equal(fixtureBuffer[0], 0xef);
  assert.equal(fixtureBuffer[1], 0xbb);
  assert.equal(fixtureBuffer[2], 0xbf);
});

test("parsePolice172159Csv: parses a real recorded sample into structured monthly records", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice172159Csv(csvText);

  // header + 24 data rows in the fixture (113年9月–115年8月)
  assert.equal(records.length, 24);

  for (const record of records) {
    assert.ok(Number.isInteger(record.rocYear));
    assert.ok(Number.isInteger(record.rocMonth));
  }
});

test("parsePolice172159Csv: carries through the counts/amounts for a known row", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice172159Csv(csvText);

  const first = records.find((r) => r.rocYear === 113 && r.rocMonth === 9);
  assert.deepEqual(first, {
    rocYear: 113,
    rocMonth: 9,
    gangCount: 294,
    memberCount: 2486,
    seizedAmountNtd: 557385396,
    blockedAmountNtd: 1271918332,
  });
});

test("parsePolice172159Csv: strips thousands-commas from a quoted large value (114年10月's 查緝不法犯罪集團人數 is literally \"3,666\")", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice172159Csv(csvText);

  const oct114 = records.find((r) => r.rocYear === 114 && r.rocMonth === 10);
  assert.equal(oct114.memberCount, 3666);
});

test("parsePolice172159Csv: a row with a blank 年度 or 月 is dropped rather than failing the whole import", () => {
  const csvText =
    "年度,月,查緝不法犯罪集團團數,查緝不法犯罪集團人數,查扣不法所得金額,攔阻金額\n" +
    ",9,294,2486,557385396,1271918332\n" +
    "115,8,242,2210,160419997,827022999\n";
  const records = parsePolice172159Csv(csvText);
  assert.equal(records.length, 1);
  assert.equal(records[0].rocYear, 115);
});

test("police172159RawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("警政署 172159 打詐儀錶板打擊詐欺成效", police172159RawSchema, [
      {
        年度: "115",
        月: "8",
        查緝不法犯罪集團團數: "242",
        查緝不法犯罪集團人數: "2210",
        查扣不法所得金額: "160419997",
        攔阻金額: "827022999",
      },
    ]),
  );
});

test("police172159RawSchema: throws loudly if upstream renames/drops 年度 or 月", () => {
  assert.throws(
    () =>
      validateImportRows("警政署 172159 打詐儀錶板打擊詐欺成效", police172159RawSchema, [
        { 民國年: "115", 月份: "8" },
      ]),
    /field "(年度|月)"/,
  );
});

test("POLICE_172159_SOURCE_KEY is a stable identifier distinct from the 176455 domain-list source", () => {
  assert.equal(POLICE_172159_SOURCE_KEY, "police_172159");
});
