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

const { STROKE_COUNTS, isEnglishLabel, compareByStrokeOrder } = await import("./strokeOrder.ts");
const { buildNavModel, GUIDES } = await import("./navModel.ts");

// A nav label whose first character is missing from STROKE_COUNTS falls back
// to a plain string collation. That fallback is only as deterministic as the
// runtime's ICU data, and SiteNav/SiteFooter are SSR'd client components, so
// any server/browser disagreement on the order of such labels surfaces as
// React hydration error #418 on every page (found 2026-10-15: 12 first
// characters, from tools and guides added after the table was last
// regenerated, had silently drifted out of it).
test("every nav tool, category and guide label's first character is in STROKE_COUNTS", () => {
  const labels = new Set();
  for (const category of buildNavModel()) {
    labels.add(category.label);
    for (const tool of category.tools) labels.add(tool.label);
  }
  for (const guide of GUIDES) labels.add(guide.title);

  const missing = [...labels].filter(
    (label) => !isEnglishLabel(label) && STROKE_COUNTS[label.trim().charAt(0)] === undefined,
  );
  assert.deepEqual(
    missing,
    [],
    `labels whose first character is missing from STROKE_COUNTS (run: node scripts/generate-stroke-table.mjs): ${missing.join(", ")}`,
  );
});

test("compareByStrokeOrder orders by stroke count, then by an explicit zh-Hant collation", () => {
  assert.ok(compareByStrokeOrder("社福中心", "特殊車位") < 0, "社 (7 strokes) sorts before 特 (10 strokes)");
  assert.ok(compareByStrokeOrder("特殊車位", "社福中心") > 0);
  assert.equal(compareByStrokeOrder("家有長輩", "家有長輩"), 0);
});
