// Parser tests for the WHO DON list payload, against a real fixture
// captured live from www.who.int on 2026-10-15 (see
// ../__fixtures__/who-don-eventlist-sample.json's own _note field) — same
// loader-hook + fixture approach as lib/server/gdacs/sources/gdacs.test.mjs.
// Malformed/missing-field inputs are hand-written inline here, not in the
// fixture, same convention as gdacs.test.mjs.
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

const { parseWhoDonTitle, parseWhoDonItem, parseWhoDonResponse } = await import("./who.ts");

const readFixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), "utf-8"));

const listFixture = readFixture("who-don-eventlist-sample.json");

test("parseWhoDonResponse: parses every real item in the live fixture (none dropped — all have DonId/Title/PublicationDateAndTime)", () => {
  const rows = parseWhoDonResponse(listFixture);
  assert.equal(rows.length, listFixture.value.length);
});

test("parseWhoDonResponse: plain ' - ' separator, single country ('the Russian Federation' via alias)", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON620");
  assert.ok(row);
  assert.equal(row.title, "Pneumonia of undetermined etiology - the Russian Federation");
  assert.equal(row.diseaseRaw, "Pneumonia of undetermined etiology");
  assert.equal(row.countryIso, "RU");
  assert.equal(row.diseaseMapped, null); // not in the dictionary — must not be guessed
  assert.equal(row.url, "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON620");
  assert.equal(row.publishDate, "2026-10-10 15:00:00");
});

test("parseWhoDonResponse: plain ' - ' separator, dictionary-mapped disease", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON619");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Ebola disease caused by Bundibugyo virus");
  assert.equal(row.diseaseMapped, "伊波拉病毒感染");
  assert.equal(row.countryIso, "CD");
});

test("parseWhoDonResponse: no-space-before-dash separator ('disease- Country')", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON592");
  assert.ok(row);
  assert.equal(row.title, "Marburg virus disease- Ethiopia");
  assert.equal(row.diseaseRaw, "Marburg virus disease");
  assert.equal(row.countryIso, "ET");
  assert.equal(row.diseaseMapped, "馬堡病毒出血熱");
});

test("parseWhoDonResponse: disease segment itself contains parentheses, not confused for a separator", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON597");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Avian Influenza A(H9N2)");
  assert.equal(row.countryIso, "IT");
});

test("parseWhoDonResponse: en-dash '–' separator", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2025-DON589");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Ebola virus disease");
  assert.equal(row.countryIso, "CD");
});

test("parseWhoDonResponse: comma-separated multi-country title falls back to no ISO, not a guessed single country", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON613");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Ebola disease caused by Bundibugyo virus");
  assert.equal(row.diseaseMapped, "伊波拉病毒感染");
  assert.equal(row.countryIso, null);
});

test("parseWhoDonResponse: comma-separated 'Multi-locations' title has no resolvable country", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON611");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Hantavirus outbreak linked to cruise ship travel");
  assert.equal(row.countryIso, null);
  assert.equal(row.diseaseMapped, null);
});

test("parseWhoDonResponse: 'Global' location segment has no resolvable country", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "2026-DON610");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Yellow fever");
  assert.equal(row.countryIso, null);
  assert.equal(row.diseaseMapped, "黃熱病");
});

test("parseWhoDonResponse: WHO-region location segment ('African Region (AFRO)') has no resolvable single-country ISO", () => {
  const rows = parseWhoDonResponse(listFixture);
  const row = rows.find((r) => r.articleId === "DON588");
  assert.ok(row);
  assert.equal(row.diseaseRaw, "Diphtheria");
  assert.equal(row.countryIso, null);
  assert.equal(row.diseaseMapped, "白喉");
});

test("parseWhoDonTitle: finds the LAST dash even when the disease name itself contains one", () => {
  const { diseaseRaw, locationRaw } = parseWhoDonTitle("COVID-19 - India");
  assert.equal(diseaseRaw, "COVID-19");
  assert.equal(locationRaw, "India");
});

test("parseWhoDonTitle: a title with neither a dash nor a comma is kept whole as the disease, with no location", () => {
  const { diseaseRaw, locationRaw } = parseWhoDonTitle("Avian Influenza A(H5N1)");
  assert.equal(diseaseRaw, "Avian Influenza A(H5N1)");
  assert.equal(locationRaw, null);
});

test("parseWhoDonItem: drops an item with no DonId", () => {
  const row = parseWhoDonItem({ Title: "Measles - Bangladesh", PublicationDateAndTime: "2026-04-23T12:58:07Z" });
  assert.equal(row, null);
});

test("parseWhoDonItem: drops an item with no Title", () => {
  const row = parseWhoDonItem({ DonId: "2026-DON598", PublicationDateAndTime: "2026-04-23T12:58:07Z" });
  assert.equal(row, null);
});

test("parseWhoDonItem: drops an item with no (or an unparseable) PublicationDateAndTime", () => {
  const noDate = parseWhoDonItem({ DonId: "2026-DON598", Title: "Measles - Bangladesh" });
  assert.equal(noDate, null);

  const badDate = parseWhoDonItem({
    DonId: "2026-DON598",
    Title: "Measles - Bangladesh",
    PublicationDateAndTime: "not-a-date",
  });
  assert.equal(badDate, null);
});

test("parseWhoDonResponse: a malformed or empty payload returns an empty array rather than throwing", () => {
  assert.deepEqual(parseWhoDonResponse(null), []);
  assert.deepEqual(parseWhoDonResponse({}), []);
  assert.deepEqual(parseWhoDonResponse({ value: "not an array" }), []);
});
