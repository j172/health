import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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

const { TOOL_CATALOG, TOOL_GROUP_META, searchTools, getToolCatalogEntry } =
  await import("./catalog.ts");

// issue #441: every catalog entry must carry at least one keyword (a common
// nickname, synonym, or news-headline term not already covered verbatim by
// title/description/directAnswer).
test("every tool in TOOL_CATALOG has at least one keyword", () => {
  assert.ok(TOOL_CATALOG.length > 0, "TOOL_CATALOG should not be empty");

  for (const tool of TOOL_CATALOG) {
    assert.ok(
      Array.isArray(tool.keywords),
      `Tool "${tool.slug}" keywords must be an array`,
    );
    assert.ok(
      tool.keywords.length > 0,
      `Tool "${tool.slug}" must have at least one keyword`,
    );
    for (const keyword of tool.keywords) {
      assert.ok(
        typeof keyword === "string" && keyword.trim().length > 0,
        `Tool "${tool.slug}" has an empty/non-string keyword`,
      );
    }
  }
});

test("searchTools('心臟電擊') returns the AED tool", () => {
  const results = searchTools("心臟電擊");
  const slugs = results.map((tool) => tool.slug);
  assert.ok(
    slugs.includes("aed"),
    `Expected AED in results, got: ${slugs.join(", ")}`,
  );
});

test("searchTools('肥胖') returns the BMI calculator", () => {
  const results = searchTools("肥胖");
  const slugs = results.map((tool) => tool.slug);
  assert.ok(
    slugs.includes("bmi"),
    `Expected BMI in results, got: ${slugs.join(", ")}`,
  );
});

test("searchTools matches on title", () => {
  const results = searchTools("紫外線指數");
  assert.ok(results.some((tool) => tool.slug === "uv"));
});

test("searchTools matches on description", () => {
  const aed = getToolCatalogEntry("aed");
  // Pull a distinctive substring straight out of the real description so this
  // test can't silently pass via a keyword/title match instead.
  const snippet = aed.description.slice(0, 10);
  const results = searchTools(snippet);
  assert.ok(results.some((tool) => tool.slug === "aed"));
});

test("searchTools matches on directAnswer", () => {
  const bmi = getToolCatalogEntry("bmi");
  const snippet = bmi.directAnswer.slice(0, 10);
  const results = searchTools(snippet);
  assert.ok(results.some((tool) => tool.slug === "bmi"));
});

test("searchTools is case-insensitive for Latin-script terms", () => {
  const lower = searchTools("aed").map((tool) => tool.slug);
  const upper = searchTools("AED").map((tool) => tool.slug);
  assert.deepEqual(lower, upper);
  assert.ok(lower.includes("aed"));
});

test("searchTools matches the current-locale translation via the translate callback", () => {
  const translations = {
    bmi: "Body Mass Index Calculator",
  };
  const translate = (tool) => translations[tool.slug];

  // Without a translate callback, the English term shouldn't match anything.
  assert.deepEqual(searchTools("Body Mass Index"), []);

  // With it, the same query should find the tool via its translated label.
  const results = searchTools("Body Mass Index", translate);
  assert.ok(results.some((tool) => tool.slug === "bmi"));
});

test("searchTools returns no results for an empty or whitespace-only query", () => {
  assert.deepEqual(searchTools(""), []);
  assert.deepEqual(searchTools("   "), []);
});

test("searchTools returns no results for a query that matches nothing", () => {
  assert.deepEqual(searchTools("this-query-matches-absolutely-nothing-xyz"), []);
});

test("searchTools is a pure function: repeated calls with the same input return equal results", () => {
  const first = searchTools("查詢").map((tool) => tool.slug);
  const second = searchTools("查詢").map((tool) => tool.slug);
  assert.deepEqual(first, second);
});

test("searchTools does not mutate TOOL_CATALOG", () => {
  const before = JSON.stringify(TOOL_CATALOG);
  searchTools("地震");
  searchTools("肥胖", (tool) => tool.title);
  const after = JSON.stringify(TOOL_CATALOG);
  assert.equal(before, after);
});

// issue #442: reclassified from 9 groups to 7. These checks replace the old
// 9-group assertions (now in lib/server/tools/footerLinks.test.mjs's
// TOOL_GROUPS list) and verify the exact #438 §A mapping made it into
// catalog.ts with zero omissions or duplicates.
test("issue #442: exactly 7 groups exist, every tool belongs to exactly one, and per-group counts match the #438 §A mapping", () => {
  const EXPECTED_GROUPS = [
    "health-assessment",
    "medical-care",
    "elder-care-welfare",
    "family",
    "disaster-alerts",
    "environment-food",
    "life-culture",
  ];
  const EXPECTED_COUNTS = {
    "health-assessment": 12,
    "medical-care": 13,
    "elder-care-welfare": 9,
    family: 9,
    "disaster-alerts": 13,
    "environment-food": 11,
    "life-culture": 12,
  };

  assert.equal(
    TOOL_GROUP_META.length,
    7,
    `Expected exactly 7 groups, got ${TOOL_GROUP_META.length}`,
  );
  assert.deepEqual(
    TOOL_GROUP_META.map((meta) => meta.group).sort(),
    [...EXPECTED_GROUPS].sort(),
    "TOOL_GROUP_META must contain exactly the 7 new groups",
  );

  assert.equal(TOOL_CATALOG.length, 79, "TOOL_CATALOG must still have 79 entries");

  const counts = Object.fromEntries(EXPECTED_GROUPS.map((g) => [g, 0]));
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      EXPECTED_GROUPS.includes(tool.group),
      `Tool "${tool.slug}" has an invalid/old group: "${tool.group}"`,
    );
    counts[tool.group] += 1;
  }

  assert.deepEqual(
    counts,
    EXPECTED_COUNTS,
    `Per-group counts don't match the #438 §A mapping: ${JSON.stringify(counts)}`,
  );

  // Spot-check a representative sample across all 7 groups (not every one of
  // the 79 lines verbatim) against the exact #442 mapping.
  const SAMPLE_ASSIGNMENTS = {
    bmi: "health-assessment",
    vo2max: "health-assessment",
    clinics: "medical-care",
    drugs: "medical-care",
    "medical-violators": "medical-care",
    "long-term-care": "elder-care-welfare",
    "senior-friendly": "elder-care-welfare",
    "accessible-transit": "elder-care-welfare",
    "baby-friendly-hospitals": "family",
    "child-native-languages": "family",
    "vet-clinics": "family",
    earthquakes: "disaster-alerts",
    "disaster-map": "disaster-alerts",
    "child-safety-spots": "disaster-alerts",
    aqi: "environment-food",
    "food-operators": "environment-food",
    "green-certifications": "environment-food",
    youbike: "life-culture",
    "heritage-map": "life-culture",
    "tourism-factories": "life-culture",
  };
  for (const [slug, expectedGroup] of Object.entries(SAMPLE_ASSIGNMENTS)) {
    const entry = getToolCatalogEntry(slug);
    assert.equal(
      entry.group,
      expectedGroup,
      `"${slug}" should belong to "${expectedGroup}", got "${entry.group}"`,
    );
  }
});
