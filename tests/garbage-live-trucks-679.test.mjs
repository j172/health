import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Issue #679 (B-17): live garbage-truck positions on the 垃圾車與清潔隊 page.
// Source-text and wiring checks for the parts that are not pure logic (the
// behaviour of getLiveTrucks / the request handler is in
// lib/server/garbageLive/*.test.mjs): decision #13 (nothing stored), spec §4
// (own Cache-Control, shared httpClient, no secrets), owner decision D6 (no
// 「全國」), and that the page, coverage table and catalog all tell the truth
// about which counties have live data.

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
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SERVER_FILES = [
  "lib/server/garbageLive/getLiveTrucks.ts",
  "lib/server/garbageLive/handler.ts",
  "lib/server/garbageLive/fetcher.ts",
  "lib/server/garbageLive/registry.ts",
  "lib/server/garbageLive/types.ts",
  "lib/server/garbageLive/adapters/ntpc122972.ts",
  "lib/server/garbageLive/adapters/taichung83558.ts",
  "lib/server/garbageLive/adapters/shared.ts",
  "app/api/garbage-trucks/live/route.ts",
];
const UI_FILES = [
  "app/(zh)/tools/cleaning-squads/GarbageLiveTab.tsx",
  "app/(zh)/tools/cleaning-squads/GarbageLiveMap.tsx",
  "app/(zh)/tools/cleaning-squads/GarbageCoverageTable.tsx",
  "app/(zh)/tools/cleaning-squads/CleaningSquadsContent.tsx",
  "lib/tools/garbageTrucks/live.ts",
  "lib/tools/garbageTrucks/coverage.ts",
];

test("decision #13: nothing about live positions is stored — no database import, no SQL, no cron job, no table", () => {
  for (const file of SERVER_FILES) {
    const code = stripComments(read(file));
    assert.ok(!/db\/mysql|withConnection|mysql2/.test(code), `${file} must not touch the database`);
    assert.ok(!/\b(INSERT|UPDATE|DELETE|CREATE TABLE)\b/.test(code), `${file} must not contain SQL`);
  }
  const schema = read("lib/server/db/schema.ts");
  assert.ok(!/live_truck|truck_position|garbage_live/i.test(schema), "no table for live positions");
  const registerJobs = read("lib/server/cron/registerJobs.ts");
  assert.ok(!/garbageLive|garbage-live|getLiveTrucks/.test(registerJobs), "live positions are never polled by a cron job");
  // The in-process cache is a plain Map bounded by the number of cities — not memoizeQuery's shared store.
  assert.ok(
    !/memoizeQuery/.test(stripComments(read("lib/server/garbageLive/getLiveTrucks.ts"))),
    "own cache with in-flight de-duplication, not memoizeQuery",
  );
});

test("spec §4.6: upstream requests go through the shared httpClient, never global fetch()", () => {
  const fetcher = read("lib/server/garbageLive/fetcher.ts");
  assert.match(fetcher, /httpGetText\(/);
  for (const file of SERVER_FILES) {
    assert.ok(!/(?<![.\w])fetch\(/.test(stripComments(read(file))), `${file} must not call global fetch()`);
  }
});

test("spec §4.7: no secrets — no env access and no API key in the live-truck code", () => {
  for (const file of SERVER_FILES) {
    const code = stripComments(read(file));
    assert.ok(!/process\.env|apikey|api_key|authorization|token/i.test(code), `${file} must not use credentials`);
  }
});

test("route: GET only, node runtime, dynamic, and it delegates to the handler that sets Cache-Control", () => {
  const route = read("app/api/garbage-trucks/live/route.ts");
  assert.match(route, /export async function GET\(/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /handleLiveTrucksRequest\(request\)/);

  const handler = read("lib/server/garbageLive/handler.ts");
  assert.match(handler, /Cache-Control/);
  const ttls = [...handler.matchAll(/s-maxage=(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(ttls.length >= 2, "an explicit s-maxage for the healthy and the degraded response");
  for (const ttl of ttls) assert.ok(ttl > 0 && ttl <= 60, `s-maxage ${ttl} must be 1..60`);
});

test("privacy: the route and handler never read coordinates, IP addresses or cookies, and never log the request URL", () => {
  for (const file of ["app/api/garbage-trucks/live/route.ts", "lib/server/garbageLive/handler.ts"]) {
    const code = stripComments(read(file));
    assert.ok(!/searchParams\.get\("(lat|lng|latitude|longitude)"\)/.test(code), `${file} must not read coordinates`);
    assert.ok(!/x-forwarded-for|x-real-ip|cf-connecting-ip|headers\.get\(|cookies?\(/i.test(code), `${file} must not read visitor identifiers`);
    for (const [, , args] of code.matchAll(/console\.(log|warn|error|info|debug)\(([^;]*?)\);/gs)) {
      assert.ok(!/request|url|searchParams/i.test(args), `${file} logs request details: ${args}`);
    }
  }
});

test("each upstream request writes one greppable log line (what the post-deploy '5 hits -> 1 request' check counts)", () => {
  const core = read("lib/server/garbageLive/getLiveTrucks.ts");
  assert.match(core, /\[garbage-live\] upstream fetch city=/);
});

test("D6: no 「全國」 in any live-truck source file or user-visible string", () => {
  const fixtures = [
    "lib/server/garbageLive/__fixtures__/ntpc-122972-sample.csv",
    "lib/server/garbageLive/__fixtures__/taichung-83558-sample.json",
  ];
  for (const file of [...SERVER_FILES, ...UI_FILES, ...fixtures]) {
    assert.ok(!read(file).includes("全國"), `${file} contains 全國`);
  }
});

test("the coverage table is wired to the live tab's truth: 新北市 and 臺中市 have live data (#680), 臺南市／高雄市 read 「暫無即時資料」", async () => {
  const { GARBAGE_COVERAGE, LIVE_STATUS_LABELS } = await import("../lib/tools/garbageTrucks/coverage.ts");
  const row = (county) => GARBAGE_COVERAGE.find((r) => r.county === county);
  assert.equal(row("新北市").live, "available");
  assert.equal(row("臺中市").live, "available");
  assert.equal(row("臺南市").live, "unavailable");
  assert.equal(row("高雄市").live, "unavailable");
  assert.equal(LIVE_STATUS_LABELS.unavailable, "暫無即時資料");

  const table = read("app/(zh)/tools/cleaning-squads/GarbageCoverageTable.tsx");
  assert.match(table, /LIVE_STATUS_LABELS/);
  assert.match(table, /row\.live/);
});

test("the live coverage counties are exactly the counties that have a registered adapter", async () => {
  const { GARBAGE_COVERAGE } = await import("../lib/tools/garbageTrucks/coverage.ts");
  const { LIVE_TRUCK_ADAPTERS } = await import("../lib/server/garbageLive/registry.ts");
  const withAdapter = Object.values(LIVE_TRUCK_ADAPTERS).map((adapter) => adapter.county);
  assert.deepEqual(
    GARBAGE_COVERAGE.filter((r) => r.live === "available").map((r) => r.county),
    withAdapter,
  );
  // 臺南市／高雄市 are 'unavailable' precisely because they have NO adapter.
  for (const row of GARBAGE_COVERAGE.filter((r) => r.live === "unavailable")) {
    assert.ok(!withAdapter.includes(row.county), `${row.county} is unreachable and must not have an adapter`);
  }
});

test("every live city code has an adapter registered under its own key, with a matching county and no 臺南市／高雄市 stub", async () => {
  const { LIVE_TRUCK_ADAPTERS } = await import("../lib/server/garbageLive/registry.ts");
  const { LIVE_TRUCK_CITIES, countyForLiveCity } = await import("../lib/tools/garbageTrucks/live.ts");
  assert.deepEqual(Object.keys(LIVE_TRUCK_ADAPTERS), [...LIVE_TRUCK_CITIES]);
  for (const city of LIVE_TRUCK_CITIES) {
    assert.equal(LIVE_TRUCK_ADAPTERS[city].city, city);
    assert.equal(LIVE_TRUCK_ADAPTERS[city].county, countyForLiveCity(city));
    assert.match(LIVE_TRUCK_ADAPTERS[city].endpoint, /^https:\/\//);
  }
  const counties = Object.values(LIVE_TRUCK_ADAPTERS).map((adapter) => adapter.county);
  assert.deepEqual(counties, ["新北市", "臺中市"]);
});

test("page structure: the live tab sits beside the route and squad tabs and reuses the existing page (extended, not rebuilt)", () => {
  const content = read("app/(zh)/tools/cleaning-squads/CleaningSquadsContent.tsx");
  assert.match(content, /GarbageLiveTab/);
  assert.match(content, /GarbageRoutesTab/);
  assert.match(content, /GarbageCoverageTable/);
  assert.match(content, /facilitySearchConfigs\["cleaning-squads"\]/);
  assert.match(content, /垃圾車即時位置/);
  assert.ok(content.indexOf("<GarbageCoverageTable") < content.indexOf("<ToolTypeTabs"));
  // The routes tab stays the default one, so the live feed is only requested when a visitor opens that tab.
  assert.match(content, /useState\(ROUTES_TAB\)/);
});

test("live tab: reads only /api/garbage-trucks/live, never asks for the visitor's location, shows the data timestamp, stale flag and hidden count", () => {
  const tab = read("app/(zh)/tools/cleaning-squads/GarbageLiveTab.tsx");
  assert.match(tab, /\/api\/garbage-trucks\/live/);
  assert.ok(!/navigator\.geolocation|useSharedGeolocation|useGeolocation/.test(tab), "the live layer must not request location");
  assert.match(tab, /資料時間/);
  assert.match(tab, /dataAsOf/);
  assert.match(tab, /資料較舊/);
  assert.match(tab, /hiddenCount/);
  assert.match(tab, /暫無即時資料/);
  assert.match(tab, /onFindSquad/);
  // Polling is paused while the tab is in the background and stopped on unmount.
  assert.match(tab, /visibilityState === "visible"/);
  assert.match(tab, /clearInterval/);
});

test("live tab states every live city's source (from the API's per-city source), the licence, and that positions are not this site's determination", () => {
  const tab = read("app/(zh)/tools/cleaning-squads/GarbageLiveTab.tsx");
  // The attribution lists the sources of the cities actually shown, so a new city's dataset is credited without a page edit.
  assert.match(tab, /source\.label/);
  assert.match(tab, /source\.datasetUrl/);
  assert.match(tab, /政府資料開放授權條款/);
  assert.match(tab, /非本站判定/);
  // The 83558 and 122972 dataset pages are what those per-city sources resolve to.
  assert.match(read("lib/server/garbageLive/adapters/ntpc122972.ts"), /https:\/\/data\.gov\.tw\/dataset\/122972/);
  assert.match(read("lib/server/garbageLive/adapters/taichung83558.ts"), /https:\/\/data\.gov\.tw\/dataset\/83558/);
});

test("the page header names the live counties from the coverage data, so it cannot drift from the adapters", () => {
  const content = read("app/(zh)/tools/cleaning-squads/CleaningSquadsContent.tsx");
  assert.match(content, /GARBAGE_COVERAGE/);
  assert.match(content, /live === "available"/);
});

test("map layer uses the shared BaseMap and draws stale reports differently from fresh ones", () => {
  const map = read("app/(zh)/tools/cleaning-squads/GarbageLiveMap.tsx");
  assert.match(map, /import\("@\/components\/Map\/BaseMap"\)/);
  assert.match(map, /truck\.stale/);
  assert.match(map, /STALE_ICON/);
  assert.ok(!/icon=\{marker\.icon\}/.test(map));
});

test("catalog: the cleaning-squads entry mentions live positions, cites dataset 122972 and still says nothing about 全國", async () => {
  const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
  const entries = TOOL_CATALOG.filter((tool) => tool.slug === "cleaning-squads");
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.match(entry.description, /即時位置/);
  assert.match(entry.directAnswer, /即時位置/);
  assert.ok(entry.keywords.includes("垃圾車即時位置"));
  assert.ok(entry.scientificBasis.some((basis) => basis.url === "https://data.gov.tw/dataset/122972"));
  assert.ok(entry.scientificBasis.some((basis) => basis.url === "https://data.gov.tw/dataset/83558"), "臺中市 live dataset (#680) is cited");
  assert.ok(entry.faqs.some((faq) => /即時位置/.test(faq.question)));
  // #680: the live-position wording names exactly the counties that have live data, and 臺南市／高雄市 as 暫無即時資料.
  const liveFaq = entry.faqs.find((faq) => /即時位置/.test(faq.question));
  assert.match(liveFaq.answer, /新北市/);
  assert.match(liveFaq.answer, /臺中市/);
  assert.match(liveFaq.answer, /暫無即時資料/);
  assert.match(entry.description, /臺中市/);
  assert.match(entry.directAnswer, /臺中市/);
  assert.ok(!JSON.stringify(entry).includes("全國"));
  assert.match(entry.lastUpdated, /^\d{4}-\d{2}-\d{2}$/);
});

test("the new API path is not shadowed by a permanent redirect rule (no redirect work is needed for this feature)", () => {
  const rules = read("lib/redirects/permanentRedirectRules.ts");
  assert.ok(!rules.includes("garbage-trucks"));
});
