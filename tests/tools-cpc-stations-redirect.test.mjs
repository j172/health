import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #483 (2.0 §D merge item M3): unlike M1 (#447, a noindex ghost-page
// retirement) and M2 (#448, a duplicate-data retirement), "/tools/cpc-stations"
// (中油加油站服務據點地圖) had genuinely different content from "/tools/cpc-prices"
// (中油各式油氣牌價查詢) — a 600+-station service map vs. a fuel/gas price
// bulletin. Both are kept, merged behind a "本週油價"/"附近加油站" tab switch on
// cpc-prices, with the old station-map URL 301ing straight to the matching tab.

test("next.config.js redirects /tools/cpc-stations permanently to the stations tab on /tools/cpc-prices (issue #483)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");

  assert.match(content, /async redirects\(\)/, "next.config.js should define the shared redirects() function");

  assert.ok(
    /source:\s*"\/tools\/cpc-stations",\s*destination:\s*"\/tools\/cpc-prices\?tab=stations",\s*permanent:\s*true,?/.test(
      content,
    ),
    "redirects() should contain a permanent (301) entry from /tools/cpc-stations to /tools/cpc-prices?tab=stations",
  );
});

test("the /tools/cpc-stations standalone page directory no longer exists (issue #483)", () => {
  const pageDir = path.join(process.cwd(), "app", "(zh)", "tools", "cpc-stations");
  assert.ok(!fs.existsSync(pageDir), "app/(zh)/tools/cpc-stations should be deleted, not just redirected around");
});

test("catalog.ts no longer defines a standalone cpc-stations TOOL_CATALOG entry (issue #483)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !/slug:\s*"cpc-stations"/.test(catalogContent),
    "catalog.ts should no longer define a TOOL_CATALOG entry with slug \"cpc-stations\"",
  );
  assert.ok(
    /slug:\s*"cpc-prices"/.test(catalogContent),
    "catalog.ts should still define the merged cpc-prices TOOL_CATALOG entry",
  );
});

test("the merged cpc-prices catalog entry's relatedSlugs no longer self-references cpc-stations and still reaches power-grid-overview and youbike (issue #483)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  const match = catalogContent.match(/slug:\s*"cpc-prices"[\s\S]*?relatedSlugs:\s*\[([^\]]*)\]/);
  assert.ok(match, "should find the cpc-prices entry's relatedSlugs array");
  const relatedSlugs = match[1];
  assert.ok(!relatedSlugs.includes("cpc-stations"), "relatedSlugs should not reference the retired cpc-stations slug");
  assert.ok(relatedSlugs.includes("power-grid-overview"), "relatedSlugs should include power-grid-overview");
  assert.ok(relatedSlugs.includes("youbike"), "relatedSlugs should include youbike");
});

test("no other TOOL_CATALOG entry's relatedSlugs still references cpc-stations (issue #483)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !/relatedSlugs:\s*\[[^\]]*"cpc-stations"[^\]]*\]/.test(catalogContent),
    "no relatedSlugs array in catalog.ts should still reference the retired cpc-stations slug",
  );
});

test("en/ja/ko locale files no longer carry the orphaned cpc-stations catalog translation key (issue #483)", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const localeContent = fs.readFileSync(path.join(process.cwd(), "locales", `${locale}.json`), "utf-8");
    assert.ok(
      !localeContent.includes('"cpc-stations"'),
      `locales/${locale}.json should no longer have a "cpc-stations" catalog translation key`,
    );
    assert.ok(
      localeContent.includes('"cpc-prices"'),
      `locales/${locale}.json should still have a "cpc-prices" catalog translation key`,
    );
    // Must still parse as valid JSON after the key removal.
    assert.doesNotThrow(() => JSON.parse(localeContent), `locales/${locale}.json should still parse as valid JSON`);
  }
});

test("CpcPricesStationsContent.tsx reads ?tab= via useSearchParams and wires it to ToolTypeTabs' initialKey (issue #483)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "(zh)", "tools", "cpc-prices", "CpcPricesStationsContent.tsx"),
    "utf-8",
  );
  assert.match(content, /useSearchParams/, "should read the query string via next/navigation's useSearchParams");
  assert.match(content, /initialKey=\{initialKey\}/, "should pass the resolved tab key to ToolTypeTabs as initialKey");
});

test("the cpc-prices page wraps its client content in Suspense (required by useSearchParams in the App Router) (issue #483)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "(zh)", "tools", "cpc-prices", "page.tsx"),
    "utf-8",
  );
  assert.match(content, /<Suspense/, "page.tsx should wrap <CpcPricesStationsContent /> in a <Suspense> boundary");
});

test("the shipped cpc-prices page.tsx still fetches and passes through both the prices dataset and the stations dataset (issue #483)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "(zh)", "tools", "cpc-prices", "page.tsx"),
    "utf-8",
  );
  assert.match(content, /getCpcPrices\s*\(/, "page.tsx should still call getCpcPrices()");
  assert.match(content, /getCpcPriceSummary\s*\(/, "page.tsx should still call getCpcPriceSummary()");
  assert.match(content, /searchCpcStations\s*\(/, "page.tsx should now also call searchCpcStations()");
  assert.match(content, /pricesItems=/, "should pass the prices items through to the content component");
  assert.match(content, /stations=/, "should pass the stations list through to the content component");
  assert.match(content, /allStationServices=/, "should pass the station service facet list through to the content component");
});

// Reimplementation note (same reasoning as tests/useSharedGeolocation.test.mjs
// and tests/tools-green-shops-redirect.test.mjs): this repo's `node --test`
// runner has no TS/JSX loader wired up, and CpcPricesStationsContent.tsx is a
// "use client" component containing JSX, so it cannot be imported directly
// from a plain .mjs test. resolveInitialTabKey is reimplemented below exactly
// as shipped (it takes no React/Next dependency itself — plain
// string-in, string-or-undefined-out), with a source-text check further down
// asserting the shipped file still exports the same shape.
const CPC_PRICES_TAB_KEYS = ["prices", "stations"];

function resolveInitialTabKey(requestedTab) {
  return CPC_PRICES_TAB_KEYS.includes(requestedTab) ? requestedTab : undefined;
}

test("resolveInitialTabKey selects the stations tab when ?tab=stations is present (issue #483)", () => {
  assert.equal(resolveInitialTabKey("stations"), "stations");
});

test("resolveInitialTabKey selects the prices tab when ?tab=prices is present (issue #483)", () => {
  assert.equal(resolveInitialTabKey("prices"), "prices");
});

test("resolveInitialTabKey falls back to undefined (the default/first tab) when ?tab= is missing", () => {
  assert.equal(resolveInitialTabKey(null), undefined);
});

test("resolveInitialTabKey falls back to undefined when ?tab= is not a known tab key (never trusts the raw query string)", () => {
  assert.equal(resolveInitialTabKey("not-a-real-tab"), undefined);
  assert.equal(resolveInitialTabKey("<script>alert(1)</script>"), undefined);
  assert.equal(resolveInitialTabKey(""), undefined);
});

test("the shipped CpcPricesStationsContent.tsx still exports the same tab-key allowlist and validation shape asserted above (issue #483)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "(zh)", "tools", "cpc-prices", "CpcPricesStationsContent.tsx"),
    "utf-8",
  );
  assert.match(
    content,
    /export const CPC_PRICES_TAB_KEYS = \[\s*"prices",\s*"stations",?\s*\]/,
    "CPC_PRICES_TAB_KEYS should still list exactly the 2 known tab keys, in the same order the test's reimplementation assumes",
  );
  assert.match(
    content,
    /export function resolveInitialTabKey/,
    "resolveInitialTabKey should still be an exported pure function, not inlined back into the component",
  );
});
