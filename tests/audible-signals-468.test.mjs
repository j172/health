import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #468 ("盲人有聲號誌資料接入「我附近」與身心障礙者生活情境頁（TDX T2）",
// parent #438 §P T2).
//
// lib/server/nearby/{registry,aggregate}.ts, lib/server/tools/{catalog,navModel}.ts
// and app/tools/facilityConfigs.ts are plain .ts with no DB access and no JSX, so
// this file dynamically imports and exercises them directly — same loader shim as
// tests/nearby-page-466.test.mjs / lib/server/tools/navModel.test.mjs.
// lib/server/facilities/sources/tdxAudibleSignals.ts and runSync.ts make real HTTP/DB
// calls, so those are verified via source-text inspection instead, matching
// tests/nearby-page-466.test.mjs's established convention for this repo.

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

const { aggregateNearbyTypes } = await import("../lib/server/nearby/aggregate.ts");
const { NEARBY_MORE_TYPES, findNearbyTypeDef } = await import("../lib/server/nearby/registry.ts");
const { facilitySearchConfigs } = await import("../app/(zh)/tools/facilityConfigs.ts");
const { TOOL_CATALOG, getToolCatalogEntry } = await import("../lib/server/tools/catalog.ts");
const { GUIDES, buildGuide, getGuidesForTool } = await import("../lib/server/tools/navModel.ts");

const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

// ---------------------------------------------------------------------------
// 1. facilityConfigs: the new facility type the "/nearby" expansion and the
//    /tools page both read from
// ---------------------------------------------------------------------------

test('facilitySearchConfigs has an "audible-signals" entry backed by facility_type "audible_signal"', () => {
  const cfg = facilitySearchConfigs["audible-signals"];
  assert.ok(cfg, 'facilitySearchConfigs must have an "audible-signals" entry');
  assert.equal(cfg.facilityType, "audible_signal");
  assert.equal(cfg.serviceItem, "badge", "the App-trigger flag is surfaced via the badge serviceItem convention");
});

// ---------------------------------------------------------------------------
// 2. "/nearby" 更多類型 registry wiring (acceptance criterion 1)
// ---------------------------------------------------------------------------

test('"audible-signals" shows up in NEARBY_MORE_TYPES, sourced from facilitySearchConfigs (not a re-declared copy)', () => {
  const def = NEARBY_MORE_TYPES.find((d) => d.key === "audible-signals");
  assert.ok(def, 'NEARBY_MORE_TYPES must contain a def keyed "audible-signals"');
  assert.equal(def.kind, "facility");
  assert.equal(def.facilityType, "audible_signal");
  assert.equal(def.toolSlug, "audible-signals");
  const cfg = facilitySearchConfigs["audible-signals"];
  assert.equal(def.label, cfg.title);
  assert.equal(def.emoji, cfg.emoji);
  assert.equal(def.description, cfg.description);
});

test('findNearbyTypeDef("audible-signals") resolves to the same def', () => {
  const def = findNearbyTypeDef("audible-signals");
  assert.ok(def);
  assert.equal(def.key, "audible-signals");
});

// ---------------------------------------------------------------------------
// 3. Per-type failure isolation, exercised with this ticket's own data shape
//    (acceptance criterion 3 — "同步失敗不影響「我附近」其他類型正常顯示")
// ---------------------------------------------------------------------------

test("audible-signals query failing does not affect any other nearby type's result", async () => {
  const tasks = [
    { key: "aed", label: "AED", emoji: "⚡", run: async () => [{ id: 1, name: "AED 1", address: null, phone: null, lat: 1, lng: 1, distanceKm: 0.3 }] },
    {
      key: "audible-signals",
      label: "有聲號誌",
      emoji: "🔊",
      run: async () => {
        throw new Error("TDX Traffic/Road/APS/City/Taipei returned status 500");
      },
    },
    { key: "pharmacies", label: "藥局", emoji: "🏪", run: async () => [{ id: 2, name: "藥局 1", address: null, phone: null, lat: 2, lng: 2, distanceKm: 0.7 }] },
  ];

  const results = await aggregateNearbyTypes(tasks);
  const aed = results.find((r) => r.key === "aed");
  const signals = results.find((r) => r.key === "audible-signals");
  const pharmacies = results.find((r) => r.key === "pharmacies");

  assert.equal(aed.status, "ok");
  assert.equal(aed.items.length, 1);
  assert.equal(pharmacies.status, "ok", "a type queried after the failing audible-signals type must still succeed");
  assert.equal(pharmacies.items.length, 1);

  assert.equal(signals.status, "error");
  assert.deepEqual(signals.items, []);
  assert.ok(signals.error.includes("500"));
});

// ---------------------------------------------------------------------------
// 4. TOOL_CATALOG entry + "身心障礙者生活" guide step (acceptance criterion 2)
// ---------------------------------------------------------------------------

test('TOOL_CATALOG has an "audible-signals" entry in the elder-care-welfare group', () => {
  const entry = getToolCatalogEntry("audible-signals");
  assert.equal(entry.group, "elder-care-welfare");
  assert.ok(entry.keywords.length > 0);
});

test('"audible-signals" has at least one inbound relatedSlugs reference (no link island)', () => {
  const inbound = TOOL_CATALOG.some((tool) => tool.relatedSlugs.includes("audible-signals"));
  assert.ok(inbound, "some other tool must list audible-signals in its relatedSlugs");
});

test('the "disability-living" guide has a new step for audible-signals that explains App-triggering support', () => {
  const guide = GUIDES.find((g) => g.slug === "disability-living");
  assert.ok(guide, 'GUIDES must still contain "disability-living"');

  const step = guide.steps.find((s) => s.toolSlug === "audible-signals");
  assert.ok(step, 'disability-living must have a step with toolSlug "audible-signals"');
  assert.ok(step.caption.trim().length > 0);
  assert.ok(step.why.trim().length > 0);
  assert.ok(step.why.includes("App"), 'the step must explain whether App-triggering is supported, per issue #468');

  // Standing content rule: no persona labels, plain "使用者" instead.
  assert.ok(!step.caption.includes("觀光客") && !step.caption.includes("病患"));
  assert.ok(!step.why.includes("觀光客") && !step.why.includes("病患"));
});

test("buildGuide resolves the new audible-signals step to a real tool + href", () => {
  const page = buildGuide("disability-living");
  const step = page.steps.find((s) => s.toolSlug === "audible-signals");
  assert.ok(step);
  assert.equal(step.href, "/tools/audible-signals");
  assert.equal(step.tool.slug, "audible-signals");
});

test('getGuidesForTool("audible-signals") reverse-resolves back to disability-living', () => {
  const guides = getGuidesForTool("audible-signals");
  assert.deepEqual(guides.map((g) => g.slug), ["disability-living"]);
});

// ---------------------------------------------------------------------------
// 5. Source-text inspection for the TDX client + sync wiring (real HTTP/DB)
// ---------------------------------------------------------------------------

test("app/(zh)/tools/audible-signals/page.tsx exists, has metadata+canonical, and renders FacilitySearchContent", () => {
  const src = readSource("app", "(zh)", "tools", "audible-signals", "page.tsx");
  assert.ok(src.includes("metadata") || src.includes("Metadata"));
  assert.ok(src.includes("canonical"));
  assert.ok(src.includes("<FacilitySearchContent"));
  assert.ok(src.includes('facilitySearchConfigs["audible-signals"]'));
});

test("lib/server/facilities/sources/tdxAudibleSignals.ts targets TDX's confirmed basic/v1 APS path and reuses TDX_BUS_CITIES", () => {
  const src = readSource("lib", "server", "facilities", "sources", "tdxAudibleSignals.ts");
  assert.ok(src.includes("/api/basic/v1/Traffic/Road/APS/City/"), "must use the swagger-confirmed base + path (v1, not v3)");
  assert.ok(src.includes("TDX_BUS_CITIES"), "must reuse the existing 22-county map rather than re-declaring one");
  assert.ok(src.includes("getTdxToken"), "must use the shared TDX OAuth2 client, not a second token implementation");
  assert.ok(src.includes("Promise.allSettled"), "must isolate per-county failures, matching the Bus/YouBike TDX client precedent");
  assert.ok(src.includes("facilityType: \"audible_signal\""), "must map into the facility_type this ticket registers everywhere else");
  assert.ok(src.includes("AppActivatedSignal"), "must read the App-triggering flag from TDX's Aps schema");
  assert.match(src, /export (async )?function fetchTdxAudibleSignals/);
});

test("lib/server/facilities/runSync.ts registers the tdx_aps source", () => {
  const src = readSource("lib", "server", "facilities", "runSync.ts");
  assert.ok(src.includes("fetchTdxAudibleSignals"));
  assert.match(src, /key:\s*"tdx_aps"/);
});
