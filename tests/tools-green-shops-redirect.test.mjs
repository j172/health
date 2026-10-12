import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #448 (2.0 §D merge item M2): "/tools/green-shops" was the one member
// of the #256 green-certification-family merge left behind on its own page
// and catalog entry, even though its facility data (facility_type
// "green_shop") is the exact same data already reused by the "綠色商店" tab
// on /tools/green-certifications. It is retired, not merged — replaced by a
// permanent redirect that lands directly on the matching tab via `?tab=`.

test("next.config.js redirects /tools/green-shops permanently to the green-shops tab on /tools/green-certifications (issue #448)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");

  assert.match(content, /async redirects\(\)/, "next.config.js should define the shared redirects() function");

  assert.ok(
    /source:\s*"\/tools\/green-shops",\s*destination:\s*"\/tools\/green-certifications\?tab=green-shops",\s*permanent:\s*true,?/.test(
      content,
    ),
    "redirects() should contain a permanent (301) entry from /tools/green-shops to /tools/green-certifications?tab=green-shops",
  );
});

test("the pre-existing green-hotels/green-products/green-restaurants redirects also carry ?tab= now that the mechanism exists (issue #448 follow-up)", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");

  for (const key of ["green-hotels", "green-products", "green-restaurants"]) {
    assert.ok(
      new RegExp(
        `source:\\s*"/tools/${key}",\\s*destination:\\s*"/tools/green-certifications\\?tab=${key}",\\s*permanent:\\s*true,?`,
      ).test(content),
      `redirects() entry for /tools/${key} should carry ?tab=${key} so it lands on its own tab, not the default`,
    );
  }
});

test("the /tools/green-shops standalone page directory no longer exists (issue #448)", () => {
  const pageDir = path.join(process.cwd(), "app", "tools", "green-shops");
  assert.ok(!fs.existsSync(pageDir), "app/tools/green-shops should be deleted, not just redirected around");
});

test("catalog.ts no longer defines a standalone green-shops TOOL_CATALOG entry (issue #448)", () => {
  const catalogContent = fs.readFileSync(path.join(process.cwd(), "lib", "server", "tools", "catalog.ts"), "utf-8");
  assert.ok(
    !/slug:\s*"green-shops"/.test(catalogContent),
    "catalog.ts should no longer define a TOOL_CATALOG entry with slug \"green-shops\"",
  );
});

test("the /tools index no longer references green-shops (issue #448)", () => {
  const toolsIndexContent = fs.readFileSync(path.join(process.cwd(), "app", "tools", "page.tsx"), "utf-8");
  assert.ok(
    !toolsIndexContent.includes('"green-shops"'),
    "/tools index page should no longer list green-shops as its own entry",
  );
});

test("facilityConfigs.ts still defines the shared green-shops facility config, reused by the green-certifications tab (issue #448)", () => {
  // Unlike the catalog entry and the standalone page, this config is NOT dead:
  // GreenCertificationsContent.tsx's "綠色商店" tab still renders
  // <FacilitySearchContent config={facilitySearchConfigs["green-shops"]} />,
  // so removing it would break the tab that now serves this exact content.
  const facilityConfigsContent = fs.readFileSync(
    path.join(process.cwd(), "app", "tools", "facilityConfigs.ts"),
    "utf-8",
  );
  assert.ok(
    facilityConfigsContent.includes('"green-shops"'),
    "facilityConfigs.ts should still define the green-shops facility config (shared with the green-certifications tab)",
  );
});

test("en/ja/ko locale files no longer carry the orphaned green-shops catalog translation key (issue #448)", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const localeContent = fs.readFileSync(path.join(process.cwd(), "locales", `${locale}.json`), "utf-8");
    assert.ok(
      !localeContent.includes('"green-shops"'),
      `locales/${locale}.json should no longer have a "green-shops" catalog translation key`,
    );
    // Must still parse as valid JSON after the key removal.
    assert.doesNotThrow(() => JSON.parse(localeContent), `locales/${locale}.json should still parse as valid JSON`);
  }
});

test("GreenCertificationsContent.tsx reads ?tab= via useSearchParams and wires it to ToolTypeTabs' initialKey (issue #448)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "tools", "green-certifications", "GreenCertificationsContent.tsx"),
    "utf-8",
  );
  assert.match(content, /useSearchParams/, "should read the query string via next/navigation's useSearchParams");
  assert.match(content, /initialKey=\{initialKey\}/, "should pass the resolved tab key to ToolTypeTabs as initialKey");
});

test("the green-certifications page wraps its client content in Suspense (required by useSearchParams in the App Router) (issue #448)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "tools", "green-certifications", "page.tsx"),
    "utf-8",
  );
  assert.match(content, /<Suspense/, "page.tsx should wrap <GreenCertificationsContent /> in a <Suspense> boundary");
});

// Reimplementation note (same reasoning as tests/useSharedGeolocation.test.mjs):
// this repo's `node --test` runner has no TS/JSX loader wired up, and
// GreenCertificationsContent.tsx is a "use client" component containing JSX,
// so it cannot be imported directly from a plain .mjs test. resolveInitialTabKey
// is reimplemented below exactly as shipped (it takes no React/Next dependency
// itself — plain string-in, string-or-undefined-out), with a source-text check
// further down asserting the shipped file still exports the same shape.
const GREEN_CERTIFICATION_TAB_KEYS = [
  "green-shops",
  "green-hotels",
  "green-restaurants",
  "green-products",
];

function resolveInitialTabKey(requestedTab) {
  return GREEN_CERTIFICATION_TAB_KEYS.includes(requestedTab) ? requestedTab : undefined;
}

test("resolveInitialTabKey selects the green-shops tab when ?tab=green-shops is present (issue #448)", () => {
  assert.equal(resolveInitialTabKey("green-shops"), "green-shops");
});

test("resolveInitialTabKey selects each of the other known tabs too", () => {
  assert.equal(resolveInitialTabKey("green-hotels"), "green-hotels");
  assert.equal(resolveInitialTabKey("green-restaurants"), "green-restaurants");
  assert.equal(resolveInitialTabKey("green-products"), "green-products");
});

test("resolveInitialTabKey falls back to undefined (the default/first tab) when ?tab= is missing", () => {
  assert.equal(resolveInitialTabKey(null), undefined);
});

test("resolveInitialTabKey falls back to undefined when ?tab= is not a known tab key (never trusts the raw query string)", () => {
  assert.equal(resolveInitialTabKey("not-a-real-tab"), undefined);
  assert.equal(resolveInitialTabKey("<script>alert(1)</script>"), undefined);
  assert.equal(resolveInitialTabKey(""), undefined);
});

test("the shipped GreenCertificationsContent.tsx still exports the same tab-key allowlist and validation shape asserted above (issue #448)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app", "tools", "green-certifications", "GreenCertificationsContent.tsx"),
    "utf-8",
  );
  assert.match(
    content,
    /export const GREEN_CERTIFICATION_TAB_KEYS = \[\s*"green-shops",\s*"green-hotels",\s*"green-restaurants",\s*"green-products",\s*\]/,
    "GREEN_CERTIFICATION_TAB_KEYS should still list exactly the 4 known tab keys, in the same order the test's reimplementation assumes",
  );
  assert.match(
    content,
    /export function resolveInitialTabKey/,
    "resolveInitialTabKey should still be an exported pure function, not inlined back into the component",
  );
});
