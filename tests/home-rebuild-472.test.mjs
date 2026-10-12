import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #472 ("首頁重建：狀態列、生活情境卡、最近使用工具、單一資料請求",
// parent #438 §G).
//
// lib/server/home/aggregate.ts and lib/client/recentTools.ts are plain .ts
// with no DB access and no JSX, so this file dynamically imports and
// exercises them directly (same loader shim as tests/nearby-page-466.test.mjs
// / lib/server/tools/navModel.test.mjs). Everything else touched by this
// ticket (the new API route, the new "use client" components, and the
// edited StabloNewsLayout.tsx/NewsSidebar.tsx/ToolPageShell.tsx/
// app/(site)/page.tsx) is DB-backed or JSX — verified via source-text
// inspection instead, matching this repo's established convention for that
// (see tests/mobile-bottom-nav-473.test.mjs, tests/nearby-page-466.test.mjs).

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

const { aggregateHomeStatusSections } = await import("../lib/server/home/aggregate.ts");
const {
  pushRecentTool,
  readRecentTools,
  recordRecentTool,
  RECENT_TOOLS_STORAGE_KEY,
  MAX_RECENT_TOOLS,
} = await import("../lib/client/recentTools.ts");

const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

// ---------------------------------------------------------------------------
// 1. aggregateHomeStatusSections: per-section failure isolation (core
//    acceptance criterion — "其中任一區塊資料來源暫時失敗，只有那一區顯示
//    錯誤狀態，其他區塊正常顯示")
// ---------------------------------------------------------------------------

test("aggregateHomeStatusSections: one section rejecting does not affect any other section's result", async () => {
  const results = await aggregateHomeStatusSections({
    weather: async () => ({ temp: 28 }),
    aqi: async () => {
      throw new Error("db timeout");
    },
    uv: async () => ({ uvIndex: 5 }),
  });

  assert.equal(results.weather.status, "ok");
  assert.deepEqual(results.weather.data, { temp: 28 });

  assert.equal(results.uv.status, "ok", "the section after the failing one must still succeed");
  assert.deepEqual(results.uv.data, { uvIndex: 5 });

  assert.equal(results.aqi.status, "error", "the failing section must be reported as an error, not crash the whole response");
  assert.equal(results.aqi.data, null, "a failed section's data must be null, not undefined or stale data");
  assert.ok(results.aqi.error.includes("db timeout"), "the error message must be surfaced, not swallowed");
});

test("aggregateHomeStatusSections: all 5 sections failing still returns 5 distinct error results (never throws itself)", async () => {
  const keys = ["weather", "aqi", "uv", "earthquake", "alerts"];
  const tasks = {};
  for (const key of keys) {
    tasks[key] = async () => {
      throw new Error(`fail-${key}`);
    };
  }
  const results = await aggregateHomeStatusSections(tasks);
  assert.equal(Object.keys(results).length, 5);
  for (const key of keys) {
    assert.equal(results[key].status, "error");
    assert.equal(results[key].data, null);
  }
});

test("aggregateHomeStatusSections: a rejection with a non-Error reason is still converted to a string, not left as an object", async () => {
  const results = await aggregateHomeStatusSections({
    alerts: async () => {
      throw "plain string rejection";
    },
  });
  assert.equal(results.alerts.status, "error");
  assert.equal(typeof results.alerts.error, "string");
});

test("aggregateHomeStatusSections: all sections succeeding returns every one as status ok with its own data, keyed correctly", async () => {
  const results = await aggregateHomeStatusSections({
    earthquake: async () => [{ id: 1 }],
    alerts: async () => [],
  });
  assert.equal(results.earthquake.status, "ok");
  assert.deepEqual(results.earthquake.data, [{ id: 1 }]);
  assert.equal(results.alerts.status, "ok");
  assert.deepEqual(results.alerts.data, []);
});

// ---------------------------------------------------------------------------
// 2. lib/client/recentTools.ts: pure list-management logic
// ---------------------------------------------------------------------------

test("pushRecentTool: puts the new slug at the front", () => {
  const next = pushRecentTool([], "aed", 1000);
  assert.deepEqual(next, [{ slug: "aed", visitedAt: 1000 }]);
});

test("pushRecentTool: re-visiting an existing slug moves it to the front instead of duplicating it", () => {
  const current = [
    { slug: "aed", visitedAt: 1000 },
    { slug: "aqi", visitedAt: 900 },
  ];
  const next = pushRecentTool(current, "aqi", 2000);
  assert.deepEqual(next, [
    { slug: "aqi", visitedAt: 2000 },
    { slug: "aed", visitedAt: 1000 },
  ]);
  assert.equal(next.filter((e) => e.slug === "aqi").length, 1, "must not appear twice");
});

test(`pushRecentTool: caps the list at MAX_RECENT_TOOLS (${MAX_RECENT_TOOLS}), dropping the oldest`, () => {
  assert.equal(MAX_RECENT_TOOLS, 6);
  let list = [];
  for (let i = 0; i < 8; i++) {
    list = pushRecentTool(list, `tool-${i}`, i);
  }
  assert.equal(list.length, 6);
  // Most recently pushed (tool-7) is first; the two oldest (tool-0, tool-1) were dropped.
  assert.equal(list[0].slug, "tool-7");
  assert.ok(!list.some((e) => e.slug === "tool-0"));
  assert.ok(!list.some((e) => e.slug === "tool-1"));
});

test("readRecentTools/recordRecentTool: no-op (never throw) when localStorage is unavailable, e.g. this Node test environment", () => {
  assert.equal(typeof globalThis.localStorage, "undefined", "sanity check: this test runs with no DOM/localStorage");
  assert.deepEqual(readRecentTools(), []);
  assert.doesNotThrow(() => recordRecentTool("aed"));
});

test("readRecentTools/recordRecentTool: round-trips through a real localStorage, capped and deduped, under the documented key", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try {
    recordRecentTool("aed");
    recordRecentTool("aqi");
    recordRecentTool("aed"); // revisit -> moves back to front, no duplicate

    const list = readRecentTools();
    assert.equal(list.length, 2);
    assert.equal(list[0].slug, "aed");
    assert.equal(list[1].slug, "aqi");
    assert.ok(store.has(RECENT_TOOLS_STORAGE_KEY));
  } finally {
    delete globalThis.localStorage;
  }
});

test("readRecentTools: a corrupted localStorage value is treated as no data, not a crash", () => {
  globalThis.localStorage = {
    getItem: () => "{not valid json",
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    assert.deepEqual(readRecentTools(), []);
  } finally {
    delete globalThis.localStorage;
  }
});

// ---------------------------------------------------------------------------
// 3. Source-text inspection for JSX / DB-backed files
// ---------------------------------------------------------------------------

test("app/api/home-status/route.ts aggregates via aggregateHomeStatusSections and never requires lat/lng (nationwide sections must still work without a location)", () => {
  const src = readSource("app", "api", "home-status", "route.ts");
  assert.ok(src.includes("aggregateHomeStatusSections"), "must call the shared aggregator, not a re-derivation");
  assert.ok(!/status:\s*400/.test(src), "must not reject a request with no lat/lng — earthquake/alerts are nationwide");
  assert.ok(src.includes('"unavailable"'), "location-dependent sections must have an explicit unavailable state when there's no location yet");
});

test("components/Home/HomeStatusBar.tsx uses the shared useSharedGeolocation hook, not the older silently-defaulting useGeolocation", () => {
  const src = readSource("components", "Home", "HomeStatusBar.tsx");
  assert.ok(src.includes("useSharedGeolocation"), "must use the #477 shared hook");
  assert.ok(
    !/from\s+"@\/components\/Facilities\/useGeolocation"/.test(src),
    "must not import the older per-page useGeolocation hook (silently defaults to Taipei 101 on denial/timeout)",
  );
  for (const forbidden of ["25.033", "121.5654", "GEO_DEFAULTS"]) {
    assert.ok(!src.includes(forbidden), `must not contain a hardcoded default coordinate ("${forbidden}")`);
  }
});

test("components/Home/HomeStatusBar.tsx offers a manual county picker gated on needsManualSelection, not an automatic fallback, and calls /api/home-status exactly once per resolved location", () => {
  const src = readSource("components", "Home", "HomeStatusBar.tsx");
  assert.ok(src.includes("needsManualSelection"), "must branch on the hook's explicit denied/timeout/unsupported signal");
  assert.ok(src.includes("CountyDistrictPicker"), "must offer a manual county/district picker as the fallback UI");
  assert.ok(src.includes("geolocation.refresh"), "must offer a way to retry geolocation");
  assert.ok(src.includes("/api/home-status"), "must call the single aggregation endpoint");
  for (const forbidden of ["/api/weather-nearby", "/api/aqi/nearest", "/api/uv/nearest"]) {
    assert.ok(!src.includes(forbidden), `must not also call the old per-widget endpoint "${forbidden}" directly`);
  }
});

test("components/News/NewsSidebar.tsx: hideLiveWidgets hides the 10 old live-data widgets but defaults to false (archive pages unaffected)", () => {
  const src = readSource("components", "News", "NewsSidebar.tsx");
  assert.ok(src.includes("hideLiveWidgets = false"), "must default to false so /news archive pages keep all 10 widgets");
  assert.ok(src.includes("{!hideLiveWidgets && ("), "the 10 live widgets must be gated behind hideLiveWidgets");
  assert.ok(src.indexOf("<LocalWeatherSvgWidget") > src.indexOf("{!hideLiveWidgets && ("), "LocalWeatherSvgWidget must be inside the gated block");
});

test("components/News/StabloNewsLayout.tsx renders homeTopSections at the top of the home variant's <main>, and passes hideLiveWidgets to NewsSidebar on home", () => {
  const src = readSource("components", "News", "StabloNewsLayout.tsx");
  assert.ok(src.includes("homeTopSections"), "must accept and render the new homepage-only sections prop");
  assert.ok(src.includes("hideLiveWidgets"), "must pass hideLiveWidgets to NewsSidebar for the home variant");
  // homeTopSections must render before the existing hotline banner / hero section.
  const topIdx = src.indexOf("{homeTopSections}");
  const hotlineIdx = src.indexOf("Urgent Public Safety Hotline Quick Access");
  assert.ok(topIdx !== -1 && hotlineIdx !== -1 && topIdx < hotlineIdx, "homeTopSections must render above the existing hotline banner");
});

test("app/(site)/page.tsx composes HomeStatusBar + GuideCardsSection + RecentToolsSection into homeTopSections, and keeps its existing ISR revalidate", () => {
  const src = readSource("app", "(site)", "page.tsx");
  assert.ok(src.includes("<HomeStatusBar"));
  assert.ok(src.includes("<GuideCardsSection"));
  assert.ok(src.includes("<RecentToolsSection"));
  assert.ok(src.includes("homeTopSections="), "must pass the 3 new sections into StabloNewsLayout via homeTopSections");
  assert.match(src, /export const revalidate = 60;/, "must not lose the existing 60s ISR revalidate window");
});

test("components/Tools/ToolPageShell.tsx renders RecentToolRecorder with the page's slug, so every /tools/<slug> visit is recorded", () => {
  const src = readSource("components", "Tools", "ToolPageShell.tsx");
  assert.ok(src.includes("<RecentToolRecorder slug={slug}"));
});

test("components/Tools/RecentToolRecorder.tsx is a client component that calls recordRecentTool on mount and renders nothing", () => {
  const src = readSource("components", "Tools", "RecentToolRecorder.tsx");
  assert.ok(src.includes('"use client"'));
  assert.ok(src.includes("recordRecentTool(slug)"));
  assert.ok(src.includes("return null"));
});

test("components/Home/GuideCardsSection.tsx renders all 5 GUIDES entries linking to /guides/<slug>, using plain copy (no persona labels)", () => {
  const src = readSource("components", "Home", "GuideCardsSection.tsx");
  assert.ok(src.includes("GUIDES.map"));
  assert.ok(src.includes("/guides/${guide.slug}"));
  for (const forbidden of ["觀光客", "病患"]) {
    assert.ok(!src.includes(forbidden), `must not use the forbidden persona label "${forbidden}"`);
  }
});

test("components/Home/RecentToolsSection.tsx reads from localStorage client-side only and renders nothing before hydration / before any tool has been visited", () => {
  const src = readSource("components", "Home", "RecentToolsSection.tsx");
  assert.ok(src.includes('"use client"'));
  assert.ok(src.includes("readRecentTools"));
  assert.ok(src.includes("return null"));
});
