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

const { parsePolice160055Csv, police160055RawSchema, POLICE_160055_SOURCE_KEY } = await import(
  "./police160055.ts"
);
const { validateImportRows } = await import("../../validation/importSchema.ts");

const fixturePath = new URL("../__fixtures__/police-160055-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

test("fixture file is UTF-8 with a BOM, as served live by opdadm.moi.gov.tw", () => {
  assert.equal(fixtureBuffer[0], 0xef);
  assert.equal(fixtureBuffer[1], 0xbb);
  assert.equal(fixtureBuffer[2], 0xbf);
});

test("parsePolice160055Csv: parses a real recorded sample into structured records, dropping unusable rows", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);

  // 7 data rows in the fixture, 2 of which (a bare IP literal and a
  // single-label garbage string) don't normalize to a usable host — see
  // __fixtures__/police-160055-sample.csv.
  assert.equal(records.length, 5);

  for (const record of records) {
    assert.equal(record.source, POLICE_160055_SOURCE_KEY);
    assert.ok(record.domain.length > 0);
    assert.equal(record.siteNature, null);
  }
});

test("parsePolice160055Csv: normalizes a bare domain (no scheme) the same way checkSuspiciousUrl does", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("www.0857.games"));
});

test("parsePolice160055Csv: strips scheme/port/path from a full URL in 網址", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("dl.nzs127jn.com"));
});

test("parsePolice160055Csv: strips a path from a scheme-less host+path value", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("ebyss.jwmvcuay.com"));
});

test("parsePolice160055Csv: drops a bare IPv4 literal and a single-label garbage string rather than failing the import", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);
  const domains = records.map((r) => r.domain);
  assert.ok(!domains.includes("154.209.3.50"));
  assert.ok(!domains.includes("bitgin"));
});

test("parsePolice160055Csv: carries 網站名稱 through as fraudDescription, and 統計結束日期 normalized to YYYYMMDD", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice160055Csv(csvText);
  const record = records.find((r) => r.domain === "www.0857.games");
  assert.equal(record.fraudDescription, "0857娛樂城");
  assert.equal(record.reportedYearMonth, "20231218");
});

test("parsePolice160055Csv: a row with a blank 網址 is dropped rather than failing the whole import", () => {
  const csvText =
    "網站名稱,網址,件數,統計起始日期,統計結束日期\n" +
    "測試站,,1,2023/01/01,2023/01/07\n" +
    "真實詐騙站,real-scam.example,1,2023/01/01,2023/01/07\n";
  const records = parsePolice160055Csv(csvText);
  assert.equal(records.length, 1);
  assert.equal(records[0].domain, "real-scam.example");
});

test("police160055RawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("警政署 160055 假投資（博弈）網站", police160055RawSchema, [
      { 網站名稱: "0857娛樂城", 網址: "www.0857.games", 件數: "1", 統計起始日期: "2023/12/12", 統計結束日期: "2023/12/18" },
    ]),
  );
});

test("police160055RawSchema: throws loudly if upstream renames/drops 網址", () => {
  assert.throws(
    () =>
      validateImportRows("警政署 160055 假投資（博弈）網站", police160055RawSchema, [
        { 網站名稱: "0857娛樂城", 連結: "www.0857.games" },
      ]),
    /field "網址"/,
  );
});
