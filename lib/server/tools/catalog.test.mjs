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

const { TOOL_CATALOG, searchTools, getToolCatalogEntry } = await import(
  "./catalog.ts"
);

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
