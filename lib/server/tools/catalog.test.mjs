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

// issue #442: reclassified from 9 groups to 7 (the #438 §A mapping).
//
// issue #669 (B-0, docs/2.0/track-b-opendata-phase2-3-spec.md §4/§5): this
// block used to pin EXPECTED_COUNTS per group and `TOOL_CATALOG.length === 87`.
// Those literals are a merge hazard — two PRs that each add one tool both
// bump the same line to the same new number, git sees identical edits and
// reports no conflict, and the combined result (off by one) only fails after
// merge. It happened repeatedly across the 2026-10-14/15 PRs. The checks
// below are structural instead: they hold for any catalog size, so a PR that
// adds or retires a tool never has to touch a counter.
const EXPECTED_GROUPS = [
  "health-assessment",
  "medical-care",
  "elder-care-welfare",
  "family",
  "disaster-alerts",
  "environment-food",
  "life-culture",
];

// Spec §4: each Nav/Footer/`/tools` group stays between 8 and 15 tools. 15 is
// the documented cap (issue #562's plan); below 8 a group is not worth a menu
// column of its own.
const GROUP_MIN_TOOLS = 8;
const GROUP_MAX_TOOLS = 15;

test("issue #442: exactly 7 groups exist and every tool belongs to exactly one of them", () => {
  assert.equal(
    TOOL_GROUP_META.length,
    7,
    `Expected exactly 7 groups, got ${TOOL_GROUP_META.length}`,
  );
  assert.deepEqual(
    TOOL_GROUP_META.map((meta) => meta.group).sort(),
    [...EXPECTED_GROUPS].sort(),
    "TOOL_GROUP_META must contain exactly the 7 groups",
  );

  assert.ok(TOOL_CATALOG.length > 0, "TOOL_CATALOG should not be empty");

  const slugs = TOOL_CATALOG.map((tool) => tool.slug);
  const duplicateSlugs = slugs.filter((slug, index) => slugs.indexOf(slug) !== index);
  assert.deepEqual(duplicateSlugs, [], "every tool slug must appear in TOOL_CATALOG exactly once");

  const membership = Object.fromEntries(EXPECTED_GROUPS.map((group) => [group, []]));
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      EXPECTED_GROUPS.includes(tool.group),
      `Tool "${tool.slug}" has an invalid/old group: "${tool.group}"`,
    );
    membership[tool.group].push(tool.slug);
  }

  // Exactly-one-group, structurally: `group` is a single field, so a tool can
  // only be counted once; the per-group buckets must therefore partition the
  // catalog with nothing dropped and nothing counted twice.
  const bucketed = Object.values(membership).flat();
  assert.equal(
    bucketed.length,
    TOOL_CATALOG.length,
    "per-group membership must add up to the whole catalog",
  );
  assert.equal(new Set(bucketed).size, TOOL_CATALOG.length);
});

test(`issue #669: every group holds ${GROUP_MIN_TOOLS}-${GROUP_MAX_TOOLS} tools`, () => {
  const counts = Object.fromEntries(EXPECTED_GROUPS.map((group) => [group, 0]));
  for (const tool of TOOL_CATALOG) {
    counts[tool.group] += 1;
  }

  const outOfRange = Object.entries(counts)
    .filter(([, count]) => count < GROUP_MIN_TOOLS || count > GROUP_MAX_TOOLS)
    .map(([group, count]) => `${group}: ${count}`);

  assert.deepEqual(
    outOfRange,
    [],
    `Each group must have ${GROUP_MIN_TOOLS}-${GROUP_MAX_TOOLS} tools (current counts: ${JSON.stringify(counts)}). ` +
      "Move a tool to a group with room (docs/2.0/track-b-opendata-phase2-3-spec.md §7) instead of raising the cap.",
  );
});

test("issue #669: every tool has non-empty keywords, directAnswer and a valid lastUpdated date", () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      Array.isArray(tool.keywords) && tool.keywords.length > 0,
      `Tool "${tool.slug}" must have at least one keyword`,
    );
    assert.ok(
      typeof tool.directAnswer === "string" && tool.directAnswer.trim().length > 0,
      `Tool "${tool.slug}" must have a directAnswer`,
    );
    assert.match(
      tool.lastUpdated ?? "",
      /^\d{4}-\d{2}-\d{2}$/,
      `Tool "${tool.slug}" lastUpdated must be an ISO YYYY-MM-DD date, got ${JSON.stringify(tool.lastUpdated)}`,
    );
    assert.ok(
      !Number.isNaN(Date.parse(`${tool.lastUpdated}T00:00:00Z`)),
      `Tool "${tool.slug}" lastUpdated "${tool.lastUpdated}" is not a real calendar date`,
    );
  }
});

test("issue #442: a representative sample of tools across all 7 groups sits in its #438 §A group", () => {
  // Spot-check a representative sample across all 7 groups (not every tool)
  // against the exact #442 mapping.
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
    "early-intervention": "family",
    "vet-clinics": "family",
    "global-watch": "disaster-alerts",
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

// issue #449: a `relatedSlugs` entry must resolve to a real TOOL_CATALOG
// slug. This specifically guards against the "life-services" bug — a
// pre-#442 group/category slug that was never a valid tool, accidentally
// left in `funeral-facilities.relatedSlugs` as a copy-paste error. Checking
// against the live TOOL_GROUP_META list (rather than hardcoding
// "life-services") keeps this test catching the *class* of bug — a
// ToolGroup value confused for a tool slug — as both lists evolve.
test("issue #449: every relatedSlugs entry resolves to a real TOOL_CATALOG slug, not a ToolGroup value", () => {
  const validSlugs = new Set(TOOL_CATALOG.map((tool) => tool.slug));
  const groupNames = new Set(TOOL_GROUP_META.map((meta) => meta.group));

  for (const tool of TOOL_CATALOG) {
    for (const related of tool.relatedSlugs) {
      assert.ok(
        validSlugs.has(related),
        `Tool "${tool.slug}" has a relatedSlugs entry "${related}" that is not a real TOOL_CATALOG slug` +
          (groupNames.has(related)
            ? ` (it's a ToolGroup value, not a tool — likely a copy-paste bug)`
            : ""),
      );
    }
  }
});

// issue #449: every tool must be reachable from at least one other tool's
// relatedSlugs, so the internal-linking graph has no orphaned "link
// islands". This is a general structural check against the live
// relatedSlugs graph (not a hardcoded slug list), so it keeps catching
// regressions — e.g. a newly added tool that nobody links to yet, or an
// existing tool whose last inbound link gets removed/renamed — as the
// catalog grows.
test("issue #449: every tool has at least one inbound relatedSlugs reference from another tool", () => {
  const inboundCount = new Map(TOOL_CATALOG.map((tool) => [tool.slug, 0]));

  for (const tool of TOOL_CATALOG) {
    for (const related of tool.relatedSlugs) {
      if (related === tool.slug) continue; // self-references don't count
      if (inboundCount.has(related)) {
        inboundCount.set(related, inboundCount.get(related) + 1);
      }
    }
  }

  const zeroInbound = [...inboundCount.entries()]
    .filter(([, count]) => count === 0)
    .map(([slug]) => slug);

  assert.deepEqual(
    zeroInbound,
    [],
    `These tools have zero inbound relatedSlugs references and are link islands: ${zeroInbound.join(", ")}`,
  );
});
