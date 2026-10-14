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

const { parsePolice176455Csv, police176455RawSchema, POLICE_176455_SOURCE_KEY } = await import(
  "./police176455.ts"
);
const { validateImportRows } = await import("../../validation/importSchema.ts");

const fixturePath = new URL("../__fixtures__/police-176455-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

test("fixture file is UTF-8 with a BOM, as served live by opdadm.moi.gov.tw", () => {
  assert.equal(fixtureBuffer[0], 0xef);
  assert.equal(fixtureBuffer[1], 0xbb);
  assert.equal(fixtureBuffer[2], 0xbf);
});

test("parsePolice176455Csv: parses a real recorded sample into structured records", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice176455Csv(csvText);

  // header + 12 data rows in the fixture (see __fixtures__/police-176455-sample.csv)
  assert.equal(records.length, 12);

  for (const record of records) {
    assert.equal(record.source, POLICE_176455_SOURCE_KEY);
    assert.ok(record.domain.length > 0);
    assert.ok(record.reportedYearMonth);
  }
});

test("parsePolice176455Csv: normalizes 網域 (lower-case, matches checkSuspiciousUrl's normalization)", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice176455Csv(csvText);

  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("bbhhshf.cc"));
  assert.ok(domains.includes("savvashop-place.store"));
});

test("parsePolice176455Csv: preserves the subdomain exactly for platform-hosted tenants (does not collapse to the platform root)", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice176455Csv(csvText);
  const domains = records.map((r) => r.domain);

  assert.ok(domains.includes("u0pmj3-kv.myshopify.com"));
  assert.ok(domains.includes("funny-daffodil-cd1f66.netlify.app"));
  assert.ok(!domains.includes("myshopify.com"));
  assert.ok(!domains.includes("netlify.app"));
});

test("parsePolice176455Csv: carries through 網站性質 and 民國年月 as plain fields, not keys", () => {
  const csvText = fixtureBuffer.toString("utf-8");
  const records = parsePolice176455Csv(csvText);

  const financial = records.find((r) => r.domain === "bbhhshf.cc");
  assert.equal(financial.siteNature, "金融保險");
  assert.equal(financial.reportedYearMonth, "11412");

  const latest = records.find((r) => r.domain === "m.majestytwdex.com");
  assert.equal(latest.reportedYearMonth, "11509");
});

test("parsePolice176455Csv: a row with a blank 網域 is dropped rather than failing the whole import", () => {
  const csvText =
    "民國年月,網域,網站性質,法律依據,聲請單位\n" +
    "11509,,金融保險,詐欺犯罪危害防制條例,刑事警察局詐欺犯罪防制中心\n" +
    "11509,real-scam.example,金融保險,詐欺犯罪危害防制條例,刑事警察局詐欺犯罪防制中心\n";
  const records = parsePolice176455Csv(csvText);
  assert.equal(records.length, 1);
  assert.equal(records[0].domain, "real-scam.example");
});

test("police176455RawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("警政署 176455 遭停止解析涉詐網站", police176455RawSchema, [
      {
        民國年月: "11509",
        網域: "bbhhshf.cc",
        網站性質: "金融保險",
        法律依據: "詐欺犯罪危害防制條例",
        聲請單位: "刑事警察局詐欺犯罪防制中心",
      },
    ]),
  );
});

test("police176455RawSchema: tolerates a row with a legitimately blank 網站性質 (data quality, not a schema change)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("警政署 176455 遭停止解析涉詐網站", police176455RawSchema, [
      { 民國年月: "11509", 網域: "bbhhshf.cc", 網站性質: "", 法律依據: "", 聲請單位: "" },
    ]),
  );
});

test("police176455RawSchema: throws loudly if upstream renames/drops 網域 (the field the identity key depends on)", () => {
  assert.throws(
    () =>
      validateImportRows("警政署 176455 遭停止解析涉詐網站", police176455RawSchema, [
        { 民國年月: "11509", 域名: "bbhhshf.cc", 網站性質: "金融保險" },
      ]),
    /field "網域"/,
  );
});
