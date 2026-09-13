#!/usr/bin/env node
/**
 * Regenerates the `STROKE_COUNTS` table in `lib/server/tools/strokeOrder.ts`.
 *
 * Why a generated static table instead of a runtime dependency: the Nav and
 * Footer components (`components/News/SiteNav.tsx`, `SiteFooter.tsx`) are
 * `"use client"` and import `lib/server/tools/catalog.ts` directly, so
 * anything that module touches at eval time ships in the client bundle on
 * every page. `cnchar` + `cnchar-trad` (traditional-character-aware stroke
 * counts) are only needed once, at dev/build time, to produce a small
 * `{ 字: strokeCount }` lookup object — not at runtime. So they're
 * devDependencies, used only by this script, and the *committed output* is
 * the plain object `lib/server/tools/strokeOrder.ts` actually ships.
 *
 * Run this whenever a new category label or a tool `navLabel`/`title` in
 * `lib/server/tools/catalog.ts` introduces a first character not yet in
 * STROKE_COUNTS — `compareByStrokeOrder` throws loudly on an unknown
 * character rather than silently mis-sorting, so a missing entry surfaces
 * immediately in `npm run build`/tests rather than as a silently wrong nav
 * order.
 *
 * Usage: node scripts/generate-stroke-table.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import cnchar from "cnchar";
import trad from "cnchar-trad";

cnchar.use(trad);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(
  __dirname,
  "..",
  "lib",
  "server",
  "tools",
  "catalog.ts",
);
const outPath = path.join(
  __dirname,
  "..",
  "lib",
  "server",
  "tools",
  "strokeOrder.ts",
);

const catalogSrc = readFileSync(catalogPath, "utf8");

// Every category label the Nav/Footer render, pulled straight out of
// TOOL_GROUP_META in catalog.ts so this script never needs a second,
// hand-maintained copy of the category names.
const CATEGORY_LABELS = [
  ...catalogSrc.matchAll(/labelDefault:\s*"((?:[^"\\]|\\.)*)"/g),
].map((m) => m[1]);

// Pull every top-level tool `title:`/`navLabel:` string literal out of
// catalog.ts so the table always covers whatever is actually displayed,
// without hand-maintaining a second list of tool names here. Anchored to
// exactly 4-space indentation so this only matches a ToolCatalogEntry's own
// fields — not the same key name nested deeper inside `scientificBasis[]`
// (8-space indent) or `referenceTable` (6-space indent).
const titleMatches = [
  ...catalogSrc.matchAll(/^ {4}(?:title|navLabel):\s*"((?:[^"\\]|\\.)*)"/gm),
].map((m) => m[1]);

const isCjk = (ch) => /[㐀-鿿]/.test(ch);

const firstChars = new Set();
for (const label of [...CATEGORY_LABELS, ...titleMatches]) {
  const first = label.trim().charAt(0);
  if (isCjk(first)) firstChars.add(first);
}

const table = {};
for (const ch of [...firstChars].sort()) {
  const count = cnchar.stroke(ch);
  if (!count || typeof count !== "number") {
    console.error(`No stroke count resolved for "${ch}" — check manually.`);
    process.exitCode = 1;
    continue;
  }
  table[ch] = count;
}

const lines = [
  "/**",
  " * First-character stroke counts (Traditional Chinese) for every category",
  " * label and tool title/navLabel first character used by the Nav and",
  " * Footer components' sort order (see `compareByStrokeOrder` below).",
  " *",
  " * GENERATED — do not hand-edit. Regenerate with:",
  " *   node scripts/generate-stroke-table.mjs",
  " * Source of truth: the `cnchar` + `cnchar-trad` npm packages (devDependencies",
  " * only — see that script for why this is a committed static table rather",
  " * than a runtime dependency).",
  " */",
  "export const STROKE_COUNTS: Record<string, number> = {",
  ...Object.entries(table).map(([ch, count]) => `  ${JSON.stringify(ch)}: ${count},`),
  "};",
  "",
  "const isAsciiLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);",
  "",
  "/** Whether a displayed label starts with a Latin letter (BMI, VO2Max, …) —",
  " * these form one alphabetical block ahead of every Chinese label, per the",
  " * navbar/footer sort rule (spec: navbar-footer-reclassification-and-merges §0.2). */",
  "export function isEnglishLabel(label: string): boolean {",
  "  return isAsciiLetter(label.trim().charAt(0));",
  "}",
  "",
  "function strokeCountOf(label: string): number {",
  "  const first = label.trim().charAt(0);",
  "  const count = STROKE_COUNTS[first];",
  "  if (count === undefined) {",
  "    throw new Error(",
  "      `No stroke count for \"${first}\" (from label \"${label}\") — add it to STROKE_COUNTS ` +",
  "        `by running \\`node scripts/generate-stroke-table.mjs\\` again.`,",
  "    );",
  "  }",
  "  return count;",
  "}",
  "",
  "/**",
  " * Shared Nav/Footer ordering rule (spec: navbar-footer-reclassification-and-merges",
  " * §0.2): Latin-named items first as one alphabetical block, then Chinese items by",
  " * first-character stroke count ascending. Applied identically to category ordering",
  " * and to the tool ordering within each category — both call this one comparator.",
  " */",
  "export function compareByStrokeOrder(a: string, b: string): number {",
  "  const aEnglish = isEnglishLabel(a);",
  "  const bEnglish = isEnglishLabel(b);",
  "  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;",
  "  if (aEnglish && bEnglish) {",
  "    return a.localeCompare(b, \"en\", { numeric: true });",
  "  }",
  "  const strokeDiff = strokeCountOf(a) - strokeCountOf(b);",
  "  if (strokeDiff !== 0) return strokeDiff;",
  "  return a.localeCompare(b, \"zh-Hant\", { numeric: true });",
  "}",
  "",
];

writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${Object.keys(table).length} stroke counts to ${outPath}`);
