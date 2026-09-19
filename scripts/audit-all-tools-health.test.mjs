import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const { facilitySearchConfigs } = await import("../app/tools/facilityConfigs.ts");

test("Site-wide tools health: every tool in TOOL_CATALOG has valid metadata and no blocking loading", () => {
  assert.equal(TOOL_CATALOG.length, 80, `Expected exactly 80 tools, got ${TOOL_CATALOG.length}`);

  for (const tool of TOOL_CATALOG) {
    const pagePath = path.join(ROOT_DIR, "app", "tools", tool.slug, "page.tsx");
    assert.ok(existsSync(pagePath), `Tool ${tool.slug} missing page.tsx`);

    const content = readFileSync(pagePath, "utf-8");
    assert.ok(
      content.includes("metadata") || content.includes("Metadata"),
      `Tool ${tool.slug} missing Metadata`
    );
    assert.ok(
      content.includes("canonical") || content.includes("alternates"),
      `Tool ${tool.slug} missing canonical`
    );
    assert.ok(
      !/if\s*\(\s*(location|geo)\.loading\s*\)\s*return/.test(content),
      `Tool ${tool.slug} has blocking location.loading pattern`
    );

    if (content.includes("FacilitySearchContent")) {
      assert.ok(
        facilitySearchConfigs[tool.slug]?.facilityType,
        `Tool ${tool.slug} missing facilitySearchConfigs entry`
      );
    }
  }
});
