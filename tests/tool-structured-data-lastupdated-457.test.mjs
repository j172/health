import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #457: tool-page structured data was missing a correctly-wired
// `speakable` citable-content marker, a structured `citation` array for
// `scientificBasis`, and any per-entry "last updated" timestamp.
//
// Investigation before writing anything found the first two already
// correctly implemented (shipped earlier under #136/#471, and already
// covered by tests/tool-page-reorder-471.test.mjs's citation assertions) —
// `buildToolGraphJsonLd`'s page node already sets
// `speakable.cssSelector: ["h1", "#aeo-direct-answer", "#tool-faq-heading"]`,
// a real schema.org SpeakableSpecification pointing at the same
// `#aeo-direct-answer` element ToolPageShell.tsx renders the one-sentence
// `directAnswer` into — not a coincidental id reuse. This file re-asserts
// both as a regression guard (so a future refactor can't silently break
// them) and adds coverage for the one genuine gap this ticket fills: a
// `lastUpdated` field on every TOOL_CATALOG entry, surfaced as `dateModified`
// in the JSON-LD and as a visible "最後更新" timestamp on the page.
//
// components/Tools/ToolPageShell.tsx contains real JSX, which Node's native
// type-stripping loader cannot parse, so its markup is verified via
// source-text inspection — this repo's established convention (see
// tests/tool-page-reorder-471.test.mjs). lib/server/tools/catalog.ts and
// lib/server/news/seo.ts are plain .ts with no JSX, so they're imported and
// exercised directly via the same registerHooks resolve-hook shim
// tests/tool-page-reorder-471.test.mjs uses.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = new URL("../", import.meta.url);

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

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { buildToolGraphJsonLd } = await import("../lib/server/news/seo.ts");

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Requirement 3 (the real gap): every catalog entry has a real, non-fabricated
// lastUpdated value.
// ---------------------------------------------------------------------------

test("every TOOL_CATALOG entry (all ~81) has a lastUpdated field in YYYY-MM-DD form", () => {
  assert.ok(TOOL_CATALOG.length >= 80, `expected ~81 catalog entries, got ${TOOL_CATALOG.length}`);
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      typeof tool.lastUpdated === "string" && ISO_DATE_RE.test(tool.lastUpdated),
      `tool "${tool.slug}" must have a lastUpdated date string in YYYY-MM-DD form, got ${JSON.stringify(tool.lastUpdated)}`,
    );
    const parsed = new Date(tool.lastUpdated);
    assert.ok(!Number.isNaN(parsed.getTime()), `tool "${tool.slug}"'s lastUpdated must parse as a real date`);
    // Sanity bound: must not be in the future, and not before this repo's
    // tools feature existed (2026-01-01) -- catches an obviously fabricated
    // value without hardcoding one specific date per tool.
    assert.ok(parsed.getTime() <= Date.now() + 24 * 60 * 60 * 1000, `tool "${tool.slug}"'s lastUpdated must not be in the future`);
    assert.ok(tool.lastUpdated >= "2026-01-01", `tool "${tool.slug}"'s lastUpdated looks implausibly old: ${tool.lastUpdated}`);
  }
});

test("lastUpdated values are not all identical -- real git-sourced dates, not one fabricated constant copy-pasted everywhere", () => {
  const distinctDates = new Set(TOOL_CATALOG.map((tool) => tool.lastUpdated));
  assert.ok(
    distinctDates.size >= 2,
    "expected more than one distinct lastUpdated value across the catalog (a single repeated value would suggest a fabricated placeholder)",
  );
});

// ---------------------------------------------------------------------------
// buildToolGraphJsonLd: dateModified wiring (new) + speakable/citation
// regression guards (pre-existing, confirmed correct by this ticket).
// ---------------------------------------------------------------------------

test("buildToolGraphJsonLd exposes dateModified on the page node, equal to the catalog entry's lastUpdated", () => {
  for (const slug of ["bmi", "uv", "long-term-care"]) {
    const tool = TOOL_CATALOG.find((t) => t.slug === slug);
    assert.ok(tool, `expected a catalog entry for "${slug}"`);
    const graph = buildToolGraphJsonLd(tool);
    const pageNode = graph["@graph"].find((node) => node["@type"] === (tool.schemaType ?? "MedicalWebPage"));
    assert.ok(pageNode, `expected the page node in the JSON-LD graph for "${slug}"`);
    assert.equal(pageNode.dateModified, tool.lastUpdated);
    assert.ok(ISO_DATE_RE.test(pageNode.dateModified), "dateModified must be a valid schema.org Date string");
  }
});

test("buildToolGraphJsonLd's page node declares a real schema.org SpeakableSpecification pointing at the AEO direct-answer box", () => {
  const bmi = TOOL_CATALOG.find((t) => t.slug === "bmi");
  const graph = buildToolGraphJsonLd(bmi);
  const pageNode = graph["@graph"].find((node) => node["@type"] === (bmi.schemaType ?? "MedicalWebPage"));
  assert.ok(pageNode.speakable, "page node must declare a speakable property");
  assert.equal(pageNode.speakable["@type"], "SpeakableSpecification");
  assert.ok(Array.isArray(pageNode.speakable.cssSelector), "cssSelector must be an array of CSS selectors");
  assert.ok(
    pageNode.speakable.cssSelector.includes("#aeo-direct-answer"),
    "speakable must target #aeo-direct-answer, the element ToolPageShell.tsx renders the one-sentence directAnswer into",
  );
});

test("buildToolGraphJsonLd's citation array represents scientificBasis as typed CreativeWork entries (regression guard)", () => {
  const basisTool = TOOL_CATALOG.find((t) => t.scientificBasis.length > 0);
  assert.ok(basisTool, "expected at least one catalog tool with scientificBasis for this test to be meaningful");
  const graph = buildToolGraphJsonLd(basisTool);
  const pageNode = graph["@graph"].find((node) => node["@type"] === (basisTool.schemaType ?? "MedicalWebPage"));
  assert.equal(pageNode.citation.length, basisTool.scientificBasis.length);
  for (const [idx, citation] of pageNode.citation.entries()) {
    assert.equal(citation["@type"], "CreativeWork");
    assert.equal(citation.name, basisTool.scientificBasis[idx].title);
    assert.equal(citation.author["@type"], "Organization");
    assert.equal(citation.author.name, basisTool.scientificBasis[idx].authority);
  }
});

// ---------------------------------------------------------------------------
// ToolPageShell.tsx wiring (JSX -- source-text inspection)
// ---------------------------------------------------------------------------

const toolPageShellPath = path.join(ROOT_DIR, "components", "Tools", "ToolPageShell.tsx");
const toolPageShellContent = fs.readFileSync(toolPageShellPath, "utf-8");

test("ToolPageShell.tsx renders a visible last-updated timestamp sourced from catalogEntry.lastUpdated", () => {
  assert.ok(
    toolPageShellContent.includes('id="tool-last-updated"'),
    "expected a #tool-last-updated element",
  );
  assert.ok(
    toolPageShellContent.includes("catalogEntry?.lastUpdated") || toolPageShellContent.includes("catalogEntry.lastUpdated"),
    "the last-updated element must read catalogEntry.lastUpdated, not a hardcoded value",
  );
  assert.ok(
    toolPageShellContent.includes("toTaipei(catalogEntry.lastUpdated"),
    "must format the date through the shared toTaipei helper for locale consistency with the rest of the site",
  );
});

test("the last-updated timestamp renders before the interactive tool widget (near the top of the page, not buried below the fold)", () => {
  const lastUpdatedIdx = toolPageShellContent.indexOf('id="tool-last-updated"');
  const childrenIdx = toolPageShellContent.indexOf("{children}");
  assert.ok(lastUpdatedIdx !== -1 && childrenIdx !== -1);
  assert.ok(lastUpdatedIdx < childrenIdx, "last-updated timestamp must render before the tool widget");
});
