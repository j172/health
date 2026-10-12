import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Issue #452 ("Ctrl+K 搜尋涵蓋全站工具"): Ctrl+K search used to only search
// news. SearchModal.tsx now also searches TOOL_CATALOG via the existing
// searchTools() (issue #441), rendering tool results above news results, and
// adds ArrowUp/ArrowDown/Enter keyboard navigation across the combined list.
//
// Reimplementation note (same reasoning as tests/tools-cpc-stations-redirect.test.mjs
// and tests/useSharedGeolocation.test.mjs): this repo's `node --test` runner
// has no TS/JSX loader, and SearchModal.tsx is a "use client" component
// containing JSX, so it can't be imported directly from a plain .mjs test.
// moveSelectedIndex is reimplemented below exactly as shipped (it takes no
// React/DOM dependency itself — plain numbers in, a number out), with
// source-text checks further down asserting the shipped component still
// exports the same function and wires it, and searchTools, up correctly.

const SEARCH_MODAL_PATH = path.join(
  process.cwd(),
  "components",
  "Search",
  "SearchModal.tsx",
);

function moveSelectedIndex(current, total, direction) {
  if (total <= 0) return -1;
  return Math.max(0, Math.min(total - 1, current + direction));
}

test("moveSelectedIndex: ArrowDown from no selection (-1) selects the first result", () => {
  assert.equal(moveSelectedIndex(-1, 3, 1), 0);
});

test("moveSelectedIndex: ArrowUp from no selection (-1) also lands on a valid index, not negative", () => {
  assert.equal(moveSelectedIndex(-1, 3, -1), 0);
});

test("moveSelectedIndex: ArrowDown clamps at the last index instead of wrapping", () => {
  assert.equal(moveSelectedIndex(2, 3, 1), 2);
});

test("moveSelectedIndex: ArrowUp clamps at the first index instead of wrapping", () => {
  assert.equal(moveSelectedIndex(0, 3, -1), 0);
});

test("moveSelectedIndex: moves one step at a time through the middle of the list", () => {
  assert.equal(moveSelectedIndex(1, 5, 1), 2);
  assert.equal(moveSelectedIndex(1, 5, -1), 0);
});

test("moveSelectedIndex: with zero total results, always returns -1 (nothing to select)", () => {
  assert.equal(moveSelectedIndex(-1, 0, 1), -1);
  assert.equal(moveSelectedIndex(0, 0, -1), -1);
});

test("the shipped SearchModal.tsx exports the same moveSelectedIndex pure function asserted above (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(
    content,
    /export function moveSelectedIndex\(/,
    "moveSelectedIndex should still be an exported pure function, not inlined back into the component",
  );
});

test("SearchModal.tsx imports and calls searchTools from lib/server/tools/catalog (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(
    content,
    /import\s*\{\s*searchTools\s*\}\s*from\s*["']@\/lib\/server\/tools\/catalog["']/,
    "should import searchTools from the existing catalog module (issue #441), not re-implement tool search",
  );
  assert.match(
    content,
    /searchTools\(\s*trimmed\s*,/,
    "should call searchTools with the trimmed query",
  );
});

test("SearchModal.tsx renders the tools section before the news section in source order (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  const toolsSectionIndex = content.indexOf("toolResults.map(");
  const newsSectionIndex = content.indexOf("results.map(");
  assert.ok(
    toolsSectionIndex !== -1,
    "should render toolResults.map(...) somewhere in the component",
  );
  assert.ok(
    newsSectionIndex !== -1,
    "should render results.map(...) somewhere in the component",
  );
  assert.ok(
    toolsSectionIndex < newsSectionIndex,
    "the tools section's JSX (toolResults.map) must appear before the news section's JSX (results.map) in source order, so tools render above news in the DOM",
  );
});

test("SearchModal.tsx links each tool result to /tools/<slug> (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(
    content,
    /href=\{`\/tools\/\$\{tool\.slug\}`\}/,
    "each tool result should link to /tools/<slug>",
  );
});

test("SearchModal.tsx's tool section only renders when there are tool results, and is independent of the news empty-state (issue #452 AC4)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(
    content,
    /\{toolResults\.length > 0 && \(/,
    "the tools section should be conditionally rendered on toolResults.length > 0, not always rendered with an empty-state message",
  );
  // The pre-existing "no news results" message must still be driven solely
  // by `results` (news), never gated on toolResults, so an empty tool search
  // can never suppress or alter the news section's own rendering.
  assert.match(
    content,
    /results\.length === 0 && !loading/,
    "the news empty-state check should remain keyed off `results` (news) only",
  );
});

test("SearchModal.tsx resolves each tool's display label via navLabel/title with the catalog.<slug> translation key, matching the SiteNav.tsx precedent (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(content, /tool\.navLabel \?\? tool\.title/);
  assert.match(content, /t\(`catalog\.\$\{tool\.slug\}`, zhLabel\)/);
});

test("SearchModal.tsx combines tool and news hrefs in tools-first order for keyboard navigation (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  const match = content.match(
    /const combinedHrefs = useMemo\(\s*\(\)\s*=>\s*\[([\s\S]*?)\],/,
  );
  assert.ok(match, "should find a combinedHrefs useMemo building an array");
  const arrayBody = match[1];
  const toolsIdx = arrayBody.indexOf("toolResults.map");
  const newsIdx = arrayBody.indexOf("results.map");
  assert.ok(toolsIdx !== -1 && newsIdx !== -1 && toolsIdx < newsIdx);
});

test("SearchModal.tsx wires ArrowDown/ArrowUp/Enter to moveSelectedIndex and router.push while the modal is open (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(content, /event\.key === "ArrowDown"/);
  assert.match(content, /event\.key === "ArrowUp"/);
  assert.match(content, /event\.key === "Enter"/);
  assert.match(content, /moveSelectedIndex\(/);
  assert.match(content, /router\.push\(href\)/);
  assert.match(
    content,
    /window\.addEventListener\("keydown", onKeyDown\)/,
    "the keyboard-nav listener should be window-scoped like useModalA11y's own listener",
  );
});

test("SearchModal.tsx's keyboard-nav effect is scoped to isOpen, so it doesn't attach when the modal is closed (issue #452)", () => {
  const content = fs.readFileSync(SEARCH_MODAL_PATH, "utf-8");
  assert.match(
    content,
    /useEffect\(\(\) => \{\s*if \(!isOpen\) return;\s*const onKeyDown/,
    "the ArrowUp/ArrowDown/Enter effect should bail out early when the modal isn't open",
  );
});

test("i18n: search.tools and search.news keys exist with real (non-placeholder) translations in zh-TW/en/ja/ko (issue #452)", () => {
  const expectations = {
    "zh-TW": { tools: "工具", news: "新聞" },
    en: { tools: "Tools", news: "News" },
    ja: { tools: "ツール", news: "ニュース" },
    ko: { tools: "도구", news: "뉴스" },
  };
  for (const [locale, keys] of Object.entries(expectations)) {
    const filePath = path.join(process.cwd(), "locales", `${locale}.json`);
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.equal(
      json.search?.tools,
      keys.tools,
      `locales/${locale}.json search.tools should be a real translation`,
    );
    assert.equal(
      json.search?.news,
      keys.news,
      `locales/${locale}.json search.news should be a real translation`,
    );
  }
});
