import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #464: 相關工具推薦自動補滿到至少 4 個 — when a tool's manually
// curated `relatedSlugs` resolves to fewer than 4 tools, auto-fill the
// remainder from the same ToolGroup category until there are 4 (or the
// category itself runs out of other members).
//
// lib/server/tools/navModel.ts and catalog.ts are plain .ts with no JSX, so
// this file dynamically imports and exercises them directly (same loader
// shim as lib/server/tools/navModel.test.mjs). ToolPageShell.tsx contains
// real JSX, which Node's native type-stripping loader cannot parse, so its
// wiring is verified via source-text inspection instead — the established
// convention for anything JSX in this repo's `node --test` suite (see
// tests/tools-category-pages-459.test.mjs).

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
const { getRelatedTools } = await import("../lib/server/tools/navModel.ts");

// ---------------------------------------------------------------------------
// getRelatedTools: the full-catalog structural guarantee the acceptance
// criteria asks for explicitly ("自動化測試確認每個工具頁顯示的相關工具數量
// 都 ≥ 4").
// ---------------------------------------------------------------------------

test("every one of the 86 TOOL_CATALOG tools gets >= 4 related tools from getRelatedTools", () => {
  // 82 baseline + #601 childcare-centers + #587 global-watch + #604
  // child-subsidies + #612 postpartum-care, all merged independently on
  // 2026-10-14.
  assert.equal(TOOL_CATALOG.length, 86, "expected the catalog to have 86 tools");
  for (const tool of TOOL_CATALOG) {
    const related = getRelatedTools(tool.slug);
    assert.ok(
      related.length >= 4,
      `tool "${tool.slug}" (group "${tool.group}") only resolved ${related.length} related tools`,
    );
  }
});

// ---------------------------------------------------------------------------
// ToolPageShell.tsx wiring — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const toolPageShellPath = path.join(ROOT_DIR, "components", "Tools", "ToolPageShell.tsx");
const toolPageShellContent = fs.readFileSync(toolPageShellPath, "utf-8");

test("ToolPageShell.tsx derives relatedTools via the shared getRelatedTools helper, not an inline computation", () => {
  // Matches the import regardless of what else shares the same
  // destructured import list (issue #471 added getGuidesForTool alongside
  // getRelatedTools/getToolCategoryLink in that same statement) — this only
  // cares that getRelatedTools itself comes from navModel.
  assert.ok(
    /import\s*{[^}]*\bgetRelatedTools\b[^}]*}\s*from\s*"@\/lib\/server\/tools\/navModel"/.test(
      toolPageShellContent,
    ),
    "ToolPageShell.tsx must import getRelatedTools from lib/server/tools/navModel",
  );
  assert.ok(
    toolPageShellContent.includes("const relatedTools = getRelatedTools(slug)"),
    "ToolPageShell.tsx must compute relatedTools via getRelatedTools(slug) rather than inlining the curated-only lookup",
  );
  assert.ok(
    !/relatedSlugs\s*\.map\(/.test(toolPageShellContent),
    "the old inline relatedSlugs.map(...).filter(...) computation must be gone",
  );
});

test("ToolPageShell.tsx's related-tools section still renders from the relatedTools array unchanged", () => {
  assert.ok(
    toolPageShellContent.includes("relatedTools.length > 0") &&
      toolPageShellContent.includes("relatedTools.map((tool) =>"),
    "the related-tools JSX section must still branch on relatedTools.length and map over relatedTools",
  );
});
