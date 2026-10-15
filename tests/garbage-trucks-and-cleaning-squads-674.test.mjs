import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Issue #674 (B-16) + owner decision D6: the existing `cleaning-squads` tool is
// upgraded in place to 「垃圾車與清潔隊」 — same slug (so no redirect and no
// sitemap/nav slug churn), new display name, a 路線與收運時間 tab, a per-county
// coverage table, and not one user-visible 「全國」.

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

const read = (relative) => fs.readFileSync(new URL(relative, REPO_ROOT), "utf8");

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const entries = TOOL_CATALOG.filter((tool) => tool.slug === "cleaning-squads");
const entry = entries[0];

test("the tool keeps its slug: exactly one cleaning-squads entry, still in 環境與食品安全", () => {
  assert.equal(entries.length, 1);
  assert.equal(entry.group, "environment-food");
});

test("display name is 垃圾車與清潔隊 (nav label) and the page title leads with it", () => {
  assert.equal(entry.navLabel, "垃圾車與清潔隊");
  assert.ok(entry.title.startsWith("垃圾車與清潔隊"), entry.title);
});

test("D6: no catalog field of this tool contains 「全國」", () => {
  const haystack = JSON.stringify(entry);
  assert.ok(!haystack.includes("全國"), "catalog entry still says 全國");
});

test("description states the real coverage: route data for 臺北市 and 新北市 only, others contact their squad", () => {
  assert.match(entry.description, /臺北市/);
  assert.match(entry.description, /新北市/);
  assert.match(entry.description, /清潔隊/);
  assert.match(entry.directAnswer, /臺北市/);
  assert.match(entry.directAnswer, /新北市/);
});

test("keywords make the garbage-truck wording searchable", () => {
  for (const keyword of ["垃圾車", "清潔隊", "垃圾車路線", "收運時間"]) {
    assert.ok(entry.keywords.includes(keyword), `missing keyword ${keyword}`);
  }
});

test("catalog metadata is complete and every related slug exists", () => {
  assert.match(entry.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(entry.faqs.length >= 2, "should explain coverage in an FAQ as well as the squads one");
  assert.ok(entry.scientificBasis.length >= 2, "should cite both city datasets as well as MOENV's");
  const slugs = new Set(TOOL_CATALOG.map((tool) => tool.slug));
  for (const related of entry.relatedSlugs) {
    assert.ok(slugs.has(related), `relatedSlug ${related} does not exist`);
  }
  assert.ok(!entry.relatedSlugs.includes("cleaning-squads"));
});

test("en/ja/ko tool names mention the garbage trucks and never say 'National'", () => {
  const expectations = { en: /garbage/i, ja: /ごみ|ゴミ/, ko: /쓰레기/ };
  for (const [locale, pattern] of Object.entries(expectations)) {
    const dict = JSON.parse(read(`locales/${locale}.json`));
    const name = dict.catalog["cleaning-squads"];
    assert.match(name, pattern, `${locale} name should mention garbage trucks: ${name}`);
    assert.ok(!/national|nationwide/i.test(name), `${locale} name must not imply nationwide coverage: ${name}`);
  }
});

test("no slug change means no redirect: permanentRedirectRules does not mention cleaning-squads", () => {
  const rules = read("lib/redirects/permanentRedirectRules.ts");
  assert.ok(!rules.includes("cleaning-squads"));
});

test("the legacy cleaning_squad facility config (the 清潔隊 tab) no longer says 全國 either", () => {
  const configs = read("app/(zh)/tools/facilityConfigs.ts");
  const start = configs.indexOf('"cleaning-squads": {');
  assert.ok(start > 0);
  const block = configs.slice(start, configs.indexOf("\n  },", start));
  assert.ok(!block.includes("全國"), block);
  assert.match(block, /facilityType: "cleaning_squad"/);
});

const UI_FILES = [
  "app/(zh)/tools/cleaning-squads/page.tsx",
  "app/(zh)/tools/cleaning-squads/CleaningSquadsContent.tsx",
  "app/(zh)/tools/cleaning-squads/GarbageCoverageTable.tsx",
  "app/(zh)/tools/cleaning-squads/GarbageRoutesTab.tsx",
  "lib/tools/garbageTrucks/coverage.ts",
  "lib/tools/garbageTrucks/schedule.ts",
];

test("D6: none of the page's own source files contains the word 全國", () => {
  for (const file of UI_FILES) {
    assert.ok(fs.existsSync(new URL(file, REPO_ROOT)), `${file} should exist`);
    assert.ok(!read(file).includes("全國"), `${file} contains 全國`);
  }
});

test("page structure: tabs for 路線與收運時間 and 清潔隊聯絡資訊, coverage table above them, existing facility search reused", () => {
  const content = read("app/(zh)/tools/cleaning-squads/CleaningSquadsContent.tsx");
  assert.match(content, /GarbageCoverageTable/);
  assert.match(content, /ToolTypeTabs/);
  assert.match(content, /GarbageRoutesTab/);
  assert.match(content, /facilitySearchConfigs\["cleaning-squads"\]/);
  assert.match(content, /路線與收運時間/);
  assert.match(content, /清潔隊/);
  // The coverage table is rendered before the tab switcher in the markup.
  assert.ok(content.indexOf("<GarbageCoverageTable") < content.indexOf("<ToolTypeTabs"));

  const page = read("app/(zh)/tools/cleaning-squads/page.tsx");
  assert.match(page, /CleaningSquadsContent/);
  assert.match(page, /getToolCatalogEntry\("cleaning-squads"\)/);
});

test("uncovered counties are sent to the 清潔隊 phone data, with the issue's exact wording", () => {
  const routes = read("app/(zh)/tools/cleaning-squads/GarbageRoutesTab.tsx");
  assert.match(routes, /NO_ROUTE_DATA_MESSAGE/);
  assert.match(routes, /getRouteCityForCounty\(/);
  const coverage = read("lib/tools/garbageTrucks/coverage.ts");
  assert.match(coverage, /尚無路線資料，請洽清潔隊/);
});

test("route tab states its data sources and that schedules are not this site's determination", () => {
  const routes = read("app/(zh)/tools/cleaning-squads/GarbageRoutesTab.tsx");
  assert.match(routes, /136515/);
  assert.match(routes, /125664/);
  assert.match(routes, /非本站判定/);
  assert.match(routes, /政府資料開放授權條款/);
});

test("the route tab reads only /api/garbage-routes and never touches navigator.geolocation (hook-only rule; live layer is #679)", () => {
  const routes = read("app/(zh)/tools/cleaning-squads/GarbageRoutesTab.tsx");
  assert.match(routes, /\/api\/garbage-routes/);
  assert.ok(!/navigator\.geolocation/.test(routes));
});
