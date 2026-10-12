import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #471: tool-page section reorder — "下一步" (related tools), related
// news, and the life-situation guide(s) this tool belongs to now sit
// immediately after the tool body, ahead of the formulas/reference
// table/scientific-basis/FAQ block (now collapsed by default via native
// <details>/<summary>), with the medical disclaimer last.
//
// components/Tools/ToolPageShell.tsx contains real JSX, which Node's native
// type-stripping loader cannot parse, so its section order and markup are
// verified via source-text inspection — this repo's established convention
// for anything JSX in the `node --test` suite (see
// tests/tools-related-autofill-464.test.mjs, tests/news-tools-crosslinks-462.test.mjs).
//
// lib/server/news/seo.ts and lib/server/tools/navModel.ts are plain .ts with
// no JSX, so buildToolGraphJsonLd and getGuidesForTool are exercised
// directly to confirm the FAQPage/citation structured data is built from the
// catalog data alone — with no dependency on any collapsed/expanded UI
// state — matching this ticket's acceptance criterion that a structured-data
// validator must still see complete FAQ/scientific-basis data while the
// corresponding sections are visually collapsed.

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
const { getGuidesForTool } = await import("../lib/server/tools/navModel.ts");

const findTool = (slug) => TOOL_CATALOG.find((t) => t.slug === slug);

// ---------------------------------------------------------------------------
// ToolPageShell.tsx wiring — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const toolPageShellPath = path.join(ROOT_DIR, "components", "Tools", "ToolPageShell.tsx");
const toolPageShellContent = fs.readFileSync(toolPageShellPath, "utf-8");

test("ToolPageShell.tsx renders sections in the issue #471 order: tool body -> 下一步 -> news -> guides -> AEO -> collapsible reference block -> disclaimer", () => {
  const markers = {
    children: toolPageShellContent.indexOf("{children}"),
    relatedTools: toolPageShellContent.indexOf('id="related-tools-heading"'),
    relatedNews: toolPageShellContent.indexOf('id="related-news-heading"'),
    guides: toolPageShellContent.indexOf('id="related-guides-heading"'),
    aeo: toolPageShellContent.indexOf('id="aeo-direct-answer"'),
    formula: toolPageShellContent.indexOf('id="formula-heading"'),
    referenceTable: toolPageShellContent.indexOf('id="reference-table-heading"'),
    scientificBasis: toolPageShellContent.indexOf('id="scientific-basis-heading"'),
    faq: toolPageShellContent.indexOf('id="tool-faq-heading"'),
    disclaimer: toolPageShellContent.indexOf("醫療資訊免責聲明"),
  };

  for (const [name, idx] of Object.entries(markers)) {
    assert.ok(idx !== -1, `expected to find a marker for "${name}" in ToolPageShell.tsx`);
  }

  const order = [
    "children",
    "relatedTools",
    "relatedNews",
    "guides",
    "aeo",
    "formula",
    "referenceTable",
    "scientificBasis",
    "faq",
    "disclaimer",
  ];
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const cur = order[i];
    assert.ok(
      markers[prev] < markers[cur],
      `expected "${prev}" (at ${markers[prev]}) to appear before "${cur}" (at ${markers[cur]}) in ToolPageShell.tsx's source`,
    );
  }
});

// Matches real JSX opening tags only (`<details className=...`), not the
// bare word "<details" as it appears inside this file's own prose doc
// comments explaining the collapsible design.
const DETAILS_OPEN_TAG = /<details\s+className=/g;
const SUMMARY_OPEN_TAG = /<summary\s+className=/g;
const SECTION_OPEN_TAG = /<section\s/g;

/** Index of the last match of a global regex at or before `beforeIndex`, or -1. */
function lastMatchIndexBefore(source, globalRegex, beforeIndex) {
  let lastIndex = -1;
  for (const match of source.matchAll(globalRegex)) {
    if (match.index >= beforeIndex) break;
    lastIndex = match.index;
  }
  return lastIndex;
}

test("the formula/reference-table/scientific-basis/FAQ sections are native <details> elements (collapsed by default, content never unmounted)", () => {
  for (const headingId of [
    "formula-heading",
    "reference-table-heading",
    "scientific-basis-heading",
    "tool-faq-heading",
  ]) {
    const headingIdx = toolPageShellContent.indexOf(`id="${headingId}"`);
    assert.ok(headingIdx !== -1, `expected to find id="${headingId}"`);
    const lastDetailsOpen = lastMatchIndexBefore(toolPageShellContent, DETAILS_OPEN_TAG, headingIdx);
    const lastSectionOpen = lastMatchIndexBefore(toolPageShellContent, SECTION_OPEN_TAG, headingIdx);
    assert.ok(
      lastDetailsOpen > lastSectionOpen,
      `expected the nearest preceding wrapper for "${headingId}" to be a <details> element, not a plain <section> ` +
        `(lastDetailsOpen=${lastDetailsOpen}, lastSectionOpen=${lastSectionOpen})`,
    );
  }
  // None of these four should still be missing a <summary> toggle (the
  // collapsed-by-default UI requirement).
  const detailsBlockCount = (toolPageShellContent.match(DETAILS_OPEN_TAG) || []).length;
  const summaryCount = (toolPageShellContent.match(SUMMARY_OPEN_TAG) || []).length;
  assert.equal(detailsBlockCount, 4, "expected exactly 4 <details> blocks (formula/table/basis/FAQ)");
  assert.equal(summaryCount, 4, "expected exactly 4 <summary> toggles, one per <details> block");
});

test("the medical disclaimer section is NOT wrapped in a <details> (always visible, not collapsible)", () => {
  const disclaimerIdx = toolPageShellContent.indexOf("醫療資訊免責聲明");
  const lastDetailsOpen = lastMatchIndexBefore(toolPageShellContent, DETAILS_OPEN_TAG, disclaimerIdx);
  const lastDetailsClose = toolPageShellContent.slice(0, disclaimerIdx).lastIndexOf("</details>");
  assert.ok(
    lastDetailsClose >= lastDetailsOpen,
    "the medical disclaimer must render after the last <details> block has already closed, not inside one",
  );
});

test("ToolPageShell.tsx consumes getGuidesForTool (issue #465) and branches on an empty result", () => {
  assert.ok(
    /import\s*{[^}]*\bgetGuidesForTool\b[^}]*}\s*from\s*"@\/lib\/server\/tools\/navModel"/.test(
      toolPageShellContent,
    ),
    "ToolPageShell.tsx must import getGuidesForTool from lib/server/tools/navModel",
  );
  assert.ok(
    toolPageShellContent.includes("const guides = getGuidesForTool(slug)"),
    "ToolPageShell.tsx must compute guides via getGuidesForTool(slug)",
  );
  assert.ok(
    toolPageShellContent.includes("guides.length > 0 ? ("),
    "the guides section must branch on guides.length so a tool in no guide renders nothing",
  );
});

test("the JSON-LD <script> tag is computed from buildToolGraphJsonLd before any <details> markup, with no collapsed-state dependency", () => {
  const scriptIdx = toolPageShellContent.indexOf("dangerouslySetInnerHTML={{ __html: JSON.stringify(toolGraph) }}");
  const firstDetailsMatch = toolPageShellContent.match(DETAILS_OPEN_TAG);
  const firstDetailsIdx = firstDetailsMatch ? toolPageShellContent.indexOf(firstDetailsMatch[0]) : -1;
  assert.ok(scriptIdx !== -1 && firstDetailsIdx !== -1 && scriptIdx < firstDetailsIdx);
  // No React state hooks exist in this file at all — it's a plain async
  // Server Component — so there is no `open`/`collapsed` state variable that
  // could gate `toolGraph` or the JSON-LD <script> tag.
  assert.ok(
    !/useState|useReducer/.test(toolPageShellContent),
    "ToolPageShell.tsx must not use client-side collapsed-state hooks — the structured data must come purely from server-computed catalog data",
  );
});

// ---------------------------------------------------------------------------
// Structured-data completeness survives collapse: buildToolGraphJsonLd is a
// pure function of the catalog entry, independent of any UI state. A real
// structured-data validator reads the raw HTML's <script type="application/
// ld+json"> tag, which is unaffected by a sibling <details> element's
// open/closed attribute.
// ---------------------------------------------------------------------------

test("buildToolGraphJsonLd reports complete FAQPage data for a tool with FAQs, regardless of any UI collapse state", () => {
  const bmi = findTool("bmi");
  assert.ok(bmi.faqs.length > 0, "expected the bmi catalog entry to have FAQs for this test to be meaningful");

  const graph = buildToolGraphJsonLd(bmi);
  const faqPage = graph["@graph"].find((node) => node["@type"] === "FAQPage");
  assert.ok(faqPage, "expected a FAQPage node in the JSON-LD graph");
  assert.equal(faqPage.mainEntity.length, bmi.faqs.length);
  for (const [idx, question] of faqPage.mainEntity.entries()) {
    assert.equal(question["@type"], "Question");
    assert.equal(question.name, bmi.faqs[idx].question);
    assert.equal(question.acceptedAnswer.text, bmi.faqs[idx].answer);
  }
});

test("buildToolGraphJsonLd reports complete scientific-basis citations for a tool that has them", () => {
  const basisTool = TOOL_CATALOG.find((t) => t.scientificBasis.length > 0);
  assert.ok(basisTool, "expected at least one catalog tool with scientificBasis for this test to be meaningful");

  const graph = buildToolGraphJsonLd(basisTool);
  const webPage = graph["@graph"].find(
    (node) => node["@type"] === (basisTool.schemaType ?? "MedicalWebPage"),
  );
  assert.ok(webPage, "expected the page node in the JSON-LD graph");
  assert.equal(webPage.citation.length, basisTool.scientificBasis.length);
  for (const [idx, citation] of webPage.citation.entries()) {
    assert.equal(citation["@type"], "CreativeWork");
    assert.equal(citation.name, basisTool.scientificBasis[idx].title);
    assert.equal(citation.author.name, basisTool.scientificBasis[idx].authority);
  }
});

// ---------------------------------------------------------------------------
// getGuidesForTool (issue #465) — sanity check that this ticket's first real
// consumer gets a non-trivial, real result for at least one tool.
// ---------------------------------------------------------------------------

test("getGuidesForTool resolves at least one guide for a tool known to be a guide step (long-term-care)", () => {
  const guides = getGuidesForTool("long-term-care");
  assert.ok(guides.length >= 1);
  assert.ok(guides.some((g) => g.slug === "caring-for-elders"));
  assert.ok(guides.every((g) => g.href === `/guides/${g.slug}`));
});

test("getGuidesForTool returns [] for a tool that belongs to no life-situation guide", () => {
  const guides = getGuidesForTool("bmi");
  assert.deepEqual(guides, []);
});
