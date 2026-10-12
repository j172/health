import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// issue #484 (2.0 §D merge item M4): "/tools/home-healthcare", "/tools/elder-welfare"
// and "/tools/hakka-bogong" merged into "/tools/long-term-care" (retitled "長照照顧圈
// 地圖") as a type filter switching between 4 `facilitySearchConfigs` entries, same
// underlying pattern as the green-certifications tab family (#256/#448/#483) but with
// a dedicated pill selector (not the shared ToolTypeTabs) because the new "照顧圈"
// panel needs to read the active type itself. Also adds a brand-new adjustable
// 1/3/5km radius "care circle" feature, built as a standalone component
// (components/Facilities/CareCircleMap.tsx) specifically to avoid touching
// FacilitySearchContent, which is shared by 30 other /tools pages.

const ROOT_DIR = process.cwd();

function read(...parts) {
  return fs.readFileSync(path.join(ROOT_DIR, ...parts), "utf-8");
}

test("next.config.js redirects all 3 retired long-term-care-family URLs permanently, each to its matching ?type=", () => {
  const content = read("next.config.js");
  assert.match(content, /async redirects\(\)/, "next.config.js should define the shared redirects() function");

  const expectations = [
    ["/tools/home-healthcare", "/tools/long-term-care?type=home-healthcare"],
    ["/tools/elder-welfare", "/tools/long-term-care?type=elder-welfare"],
    ["/tools/hakka-bogong", "/tools/long-term-care?type=hakka-bogong"],
  ];

  for (const [source, destination] of expectations) {
    const re = new RegExp(
      `source:\\s*"${source.replace(/\//g, "\\/")}",\\s*destination:\\s*"${destination.replace(/[/?]/g, "\\$&")}",\\s*permanent:\\s*true,?`,
    );
    assert.ok(re.test(content), `redirects() should contain a permanent (301) entry from ${source} to ${destination}`);
  }
});

test("the pre-existing /tools/hakka-community redirect now chains straight to long-term-care's hakka-bogong type, not the retired hakka-bogong page", () => {
  const content = read("next.config.js");
  assert.ok(
    /source:\s*"\/tools\/hakka-community",\s*destination:\s*"\/tools\/long-term-care\?type=hakka-bogong",\s*permanent:\s*true,?/.test(
      content,
    ),
    "/tools/hakka-community should 301 to /tools/long-term-care?type=hakka-bogong now that /tools/hakka-bogong itself is retired",
  );
  assert.ok(
    !/destination:\s*"\/tools\/hakka-bogong"/.test(content),
    "no redirect should still point at the now-deleted /tools/hakka-bogong page",
  );
});

test("the 3 retired standalone page directories no longer exist", () => {
  for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
    const pageDir = path.join(ROOT_DIR, "app", "tools", slug);
    assert.ok(!fs.existsSync(pageDir), `app/tools/${slug} should be deleted, not just redirected around`);
  }
});

test("catalog.ts no longer defines standalone home-healthcare/elder-welfare/hakka-bogong entries, and the merged long-term-care entry is retitled", () => {
  const catalogContent = read("lib", "server", "tools", "catalog.ts");
  for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
    assert.ok(!new RegExp(`slug:\\s*"${slug}"`).test(catalogContent), `catalog.ts should no longer define a TOOL_CATALOG entry with slug "${slug}"`);
  }
  assert.ok(catalogContent.includes('slug: "long-term-care"'), "catalog.ts should still define the merged long-term-care entry");
  assert.ok(
    /slug:\s*"long-term-care"[\s\S]{0,200}title:\s*"長照照顧圈地圖"/.test(catalogContent),
    'the long-term-care entry\'s title should be "長照照顧圈地圖" per issue #484',
  );
});

test("no TOOL_CATALOG entry's relatedSlugs still references any of the 3 retired slugs", () => {
  const catalogContent = read("lib", "server", "tools", "catalog.ts");
  for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
    assert.ok(
      !new RegExp(`relatedSlugs:\\s*\\[[^\\]]*"${slug}"[^\\]]*\\]`).test(catalogContent),
      `no relatedSlugs array in catalog.ts should still reference the retired ${slug} slug`,
    );
  }
});

test("catalog.ts contains no dangling string reference to the 3 retired slugs at all (title, description, keywords, scientificBasis, faqs)", () => {
  const catalogContent = read("lib", "server", "tools", "catalog.ts");
  for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
    assert.ok(!catalogContent.includes(`"${slug}"`), `catalog.ts should contain no quoted reference to "${slug}" anywhere`);
  }
});

test("en/ja/ko locale files no longer carry the 3 orphaned catalog translation keys, and still have long-term-care", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const localeContent = read("locales", `${locale}.json`);
    for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
      assert.ok(!localeContent.includes(`"${slug}"`), `locales/${locale}.json should no longer have a "${slug}" catalog translation key`);
    }
    assert.ok(localeContent.includes('"long-term-care"'), `locales/${locale}.json should still have a "long-term-care" catalog translation key`);
    assert.doesNotThrow(() => JSON.parse(localeContent), `locales/${locale}.json should still parse as valid JSON`);
  }
});

test("facilityConfigs.ts still defines all 4 facility configs (not deleted — the merged page's type selector still switches between them)", () => {
  const content = read("app", "tools", "facilityConfigs.ts");
  for (const key of ["long-term-care", "home-healthcare", "elder-welfare", "hakka-bogong"]) {
    assert.ok(content.includes(`"${key}":`), `facilityConfigs.ts should still define the "${key}" config`);
  }
});

test("the /tools index no longer lists home-healthcare/elder-welfare/hakka-bogong as their own TOOL_ICONS entries", () => {
  const content = read("app", "tools", "page.tsx");
  for (const slug of ["home-healthcare", "elder-welfare", "hakka-bogong"]) {
    assert.ok(!content.includes(`"${slug}"`), `/tools index page should no longer reference ${slug} as its own entry`);
  }
  assert.ok(content.includes('"long-term-care"'), "/tools index page should still reference long-term-care");
});

test("SeniorFriendlyContent no longer links to the retired /tools/elder-welfare URL", () => {
  const content = read("components", "Tools", "SeniorFriendlyContent.tsx");
  assert.ok(!content.includes('href="/tools/elder-welfare"'), "SeniorFriendlyContent should not link to the retired /tools/elder-welfare slug directly");
  assert.ok(
    content.includes("/tools/long-term-care?type=elder-welfare") || content.includes('href="/tools/long-term-care"'),
    "SeniorFriendlyContent should link to the merged long-term-care page instead",
  );
});

test("long-term-care/page.tsx wraps its client content in Suspense (required by useSearchParams in the App Router)", () => {
  const content = read("app", "tools", "long-term-care", "page.tsx");
  assert.match(content, /<Suspense/, "page.tsx should wrap <LongTermCareContent /> in a <Suspense> boundary");
  assert.match(content, /<LongTermCareContent/, "page.tsx should render LongTermCareContent");
});

// Reimplementation note (same reasoning as tests/tools-cpc-stations-redirect.test.mjs
// and tests/useSharedGeolocation.test.mjs): this repo's `node --test` runner has no
// TS/JSX loader wired up, and LongTermCareContent.tsx/CareCircleMap.tsx are "use
// client" components containing JSX, so they cannot be imported directly from a
// plain .mjs test. The pure logic is reimplemented below exactly as shipped, with
// source-text checks further down asserting the shipped files still export the same
// shape.

const LONG_TERM_CARE_TYPE_KEYS = ["long-term-care", "home-healthcare", "elder-welfare", "hakka-bogong"];

function resolveInitialTypeKey(requestedType) {
  return LONG_TERM_CARE_TYPE_KEYS.includes(requestedType) ? requestedType : LONG_TERM_CARE_TYPE_KEYS[0];
}

test("resolveInitialTypeKey selects the matching type for each of the 3 retired-slug redirect targets", () => {
  assert.equal(resolveInitialTypeKey("home-healthcare"), "home-healthcare");
  assert.equal(resolveInitialTypeKey("elder-welfare"), "elder-welfare");
  assert.equal(resolveInitialTypeKey("hakka-bogong"), "hakka-bogong");
});

test("resolveInitialTypeKey falls back to long-term-care (the first/default type) when ?type= is missing or unknown (never trusts the raw query string)", () => {
  assert.equal(resolveInitialTypeKey(null), "long-term-care");
  assert.equal(resolveInitialTypeKey("not-a-real-type"), "long-term-care");
  assert.equal(resolveInitialTypeKey("<script>alert(1)</script>"), "long-term-care");
  assert.equal(resolveInitialTypeKey(""), "long-term-care");
});

test("the shipped LongTermCareContent.tsx still exports the same type-key allowlist and resolveInitialTypeKey shape asserted above", () => {
  const content = read("app", "tools", "long-term-care", "LongTermCareContent.tsx");
  assert.match(
    content,
    /export const LONG_TERM_CARE_TYPE_KEYS = \[\s*"long-term-care",\s*"home-healthcare",\s*"elder-welfare",\s*"hakka-bogong",?\s*\]/,
    "LONG_TERM_CARE_TYPE_KEYS should list exactly the 4 known type keys, long-term-care first, in the order the test's reimplementation assumes",
  );
  assert.match(content, /export function resolveInitialTypeKey/, "resolveInitialTypeKey should be an exported pure function");
  assert.match(content, /useSearchParams/, "should read the query string via next/navigation's useSearchParams");
  assert.match(
    content,
    /<FacilitySearchContent\s+config=\{facilitySearchConfigs\[activeType\]\}/,
    "should still render FacilitySearchContent with the active type's unmodified facilitySearchConfigs entry",
  );
  assert.match(content, /<CareCircleMap/, "should render the new CareCircleMap care-circle panel");
});

test("CareCircleMap.tsx implements the 1/3/5km radius toggle, the required disclaimer text, and an explicit 0-result widen prompt (not the silent auto-widen mechanism)", () => {
  const content = read("components", "Facilities", "CareCircleMap.tsx");

  assert.match(
    content,
    /export const CARE_CIRCLE_RADII_KM = \[1, 3, 5\]/,
    "CareCircleMap should expose exactly the 1/3/5km radius options required by issue #484",
  );

  // Fixed disclaimer, worded close to the issue's required text, must be present as a
  // literal string (not computed/conditionally hidden) and placed next to the radius
  // control in the component body.
  assert.match(
    content,
    /直線距離，市區約等於車程\s*10\s*分鐘，實際依路況而定/,
    "the fixed straight-line-distance disclaimer must be present verbatim",
  );

  // The widen-prompt must be explicit (user clicks/reads a message and chooses to
  // switch radius themselves), not a reuse of FacilitySearchContent's silent
  // widenedRadius/fallbackNotice auto-widen-and-show-wider-results mechanism.
  // The component may reference these names in an explanatory comment (see the
  // header doc comment), but must not actually declare them as state/behavior.
  assert.ok(!/\bconst \[\s*widenedRadius/.test(content), "CareCircleMap must not reuse FacilitySearchContent's silent widenedRadius state");
  assert.ok(!/\bconst \[\s*fallbackNotice/.test(content), "CareCircleMap must not reuse FacilitySearchContent's silent fallbackNotice state");
  assert.match(content, /可嘗試切換至/, "should prompt the user to explicitly switch to a larger radius when the current one has 0 results");

  // Must not call any routing/directions API — straight-line circle only. (The
  // doc comment is allowed to *mention* Google Maps Directions, to explain that it's
  // deliberately not used — only an actual fetch/URL to one is disallowed.)
  assert.ok(
    !/(fetch|googleapis\.com|maps\.google)[^\n]*(directions|routing)/i.test(content),
    "must not call any path-planning/routing service (issue #484: 不使用任何路徑規劃服務)",
  );
});

test("CareCircleMap.tsx counts resources itself from the returned facilities array, not from the API's total/allTotal fields (which ignore the radius filter on the DB-backed path)", () => {
  const content = read("components", "Facilities", "CareCircleMap.tsx");
  assert.match(content, /facilities\.length/, "should derive the circle count from facilities.length");
});

test("FacilitySearchContent.tsx's prop contract and default behavior are untouched by this merge (zero blast radius for its other 29 consumers)", () => {
  const content = read("components", "Facilities", "FacilitySearchContent.tsx");
  assert.match(
    content,
    /export default function FacilitySearchContent\(\{\s*config\s*\}:\s*\{\s*config:\s*FacilitySearchConfig\s*\}\)/,
    "FacilitySearchContent should still take exactly one prop (config), unchanged by this ticket",
  );
  assert.ok(!content.includes("CareCircle"), "FacilitySearchContent should have no knowledge of the new CareCircleMap component");
  assert.ok(!content.includes("radiusKm"), "FacilitySearchContent should not have grown a new user-adjustable radius concept of its own");
});

test("FacilityMap.tsx's prop contract is untouched by this merge (CareCircleMap reuses it as-is for rendering the circle overlay)", () => {
  const content = read("components", "Facilities", "FacilityMap.tsx");
  assert.match(
    content,
    /export default function FacilityMap\(\{\s*userLocation,\s*markers,\s*showRadius = true,\s*radiusMeters = 5000\s*\}:\s*FacilityMapProps\)/,
    "FacilityMap's signature/defaults should be unchanged by this ticket",
  );
});

test("README.md merges the long-term-care-family rows and updates the affected section counts", () => {
  const content = read("README.md");
  assert.ok(!content.includes("/tools/home-healthcare"), "README should no longer list a standalone home-healthcare row");
  assert.ok(!content.includes("/tools/elder-welfare"), "README should no longer list a standalone elder-welfare row");
  assert.ok(!content.includes("/tools/hakka-bogong"), "README should no longer list a standalone hakka-bogong row");
  assert.ok(content.includes("長照照顧圈地圖"), "README should list the retitled long-term-care row");
  assert.match(content, /B\. 醫療院所與即時量能資源 \(11 款\)/, "section B's count should have dropped by 1 (home-healthcare removed)");
  assert.match(content, /C\. 長照安老與身心社福資源 \(7 款\)/, "section C's count should have dropped by 2 (elder-welfare + hakka-bogong removed)");
});
