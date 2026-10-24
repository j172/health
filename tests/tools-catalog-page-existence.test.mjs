import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);
const ROOT_DIR = fileURLToPath(REPO_ROOT);

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
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { TOOL_CATALOG, TOOL_GROUP_META } = await import(
  "../lib/server/tools/catalog.ts"
);

test("every tool in TOOL_CATALOG has a corresponding app/(zh)/tools/[slug]/page.tsx", () => {
  const missingPages = [];
  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "(zh)", "tools", tool.slug, "page.tsx");
    if (!existsSync(pagePath)) {
      missingPages.push({ slug: tool.slug, expectedPath: pagePath });
    }
  }

  assert.deepEqual(
    missingPages,
    [],
    `Tools in TOOL_CATALOG missing page.tsx:\n${missingPages.map((m) => `  - ${m.slug} (${m.expectedPath})`).join("\n")}`,
  );
});

test("power-outages tool is properly registered in catalog and has valid metadata", () => {
  const entry = TOOL_CATALOG.find((t) => t.slug === "power-outages");
  assert.ok(entry, "power-outages must be registered in TOOL_CATALOG");
  assert.equal(entry.title, "即時停電地圖與搶修進度");
  assert.equal(entry.group, "disaster-alerts");
  assert.ok(entry.description.includes("停電"));
  assert.ok(entry.relatedSlugs.includes("water-outages"));
  assert.ok(entry.relatedSlugs.includes("power-grid-overview"));
  assert.ok(entry.relatedSlugs.includes("disaster-map"));

  const pagePath = path.join(ROOT_DIR, "app", "(zh)", "tools", "power-outages", "page.tsx");
  assert.ok(existsSync(pagePath), "app/(zh)/tools/power-outages/page.tsx must exist");
});

test("all tool catalog entries have valid groups matching TOOL_GROUP_META", () => {
  const validGroups = new Set(TOOL_GROUP_META.map((m) => m.group));
  for (const tool of TOOL_CATALOG) {
    assert.ok(
      validGroups.has(tool.group),
      `Tool "${tool.slug}" has invalid group "${tool.group}"`,
    );
  }
});
