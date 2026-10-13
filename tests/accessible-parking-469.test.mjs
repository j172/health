import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #469 ("孕婦親子／身心障礙／復康巴士車位接入「我附近」與兩個情境頁
// （TDX T3）", parent #438 §P T3).
//
// Same loader shim and "pure .ts via dynamic import, real HTTP/DB via source-
// text inspection" convention as tests/audible-signals-468.test.mjs (#468),
// this ticket's closest precedent.

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
// 1. facilityConfigs: the new facility type + its 4-category filter
// ---------------------------------------------------------------------------

test('facilitySearchConfigs has an "accessible-parking" entry backed by facility_type "accessible_parking"', () => {
  const cfg = facilitySearchConfigs["accessible-parking"];
  assert.ok(cfg, 'facilitySearchConfigs must have an "accessible-parking" entry');
  assert.equal(cfg.facilityType, "accessible_parking");
  assert.equal(cfg.serviceItem, "badge", "the remaining-count text is surfaced via the badge serviceItem convention");
});

test('"accessible-parking" categories list exactly the 4 space types the issue allows, nothing else', () => {
  const cfg = facilitySearchConfigs["accessible-parking"];
  assert.ok(Array.isArray(cfg.categories));
  const values = cfg.categories.map((c) => c.value);
  assert.deepEqual(
    values.sort(),
    ["孕婦及親子專用車位", "復康巴士", "身心障礙機車車位", "身心障礙汽車車位"].sort(),
  );
  // 婦女車位 (SpaceType 8) must NOT be one of the filter categories — the issue
  // explicitly names only 4 types.
  assert.ok(!values.some((v) => v.includes("婦女")));
});

// ---------------------------------------------------------------------------
// 2. "/nearby" 更多類型 registry wiring (acceptance criterion 1)
// ---------------------------------------------------------------------------

test('"accessible-parking" shows up in NEARBY_MORE_TYPES, sourced from facilitySearchConfigs (not a re-declared copy)', () => {
  const def = NEARBY_MORE_TYPES.find((d) => d.key === "accessible-parking");
  assert.ok(def, 'NEARBY_MORE_TYPES must contain a def keyed "accessible-parking"');
  assert.equal(def.kind, "facility");
  assert.equal(def.facilityType, "accessible_parking");
  assert.equal(def.toolSlug, "accessible-parking");
  const cfg = facilitySearchConfigs["accessible-parking"];
  assert.equal(def.label, cfg.title);
  assert.equal(def.emoji, cfg.emoji);
  assert.equal(def.description, cfg.description);
});

test('findNearbyTypeDef("accessible-parking") resolves to the same def', () => {
  const def = findNearbyTypeDef("accessible-parking");
  assert.ok(def);
  assert.equal(def.key, "accessible-parking");
});

// ---------------------------------------------------------------------------
// 3. Per-type failure isolation, exercised with this ticket's own data shape
// ---------------------------------------------------------------------------

test("accessible-parking query failing does not affect any other nearby type's result", async () => {
  const tasks = [
    { key: "aed", label: "AED", emoji: "⚡", run: async () => [{ id: 1, name: "AED 1", address: null, phone: null, lat: 1, lng: 1, distanceKm: 0.3 }] },
    {
      key: "accessible-parking",
      label: "特殊車位",
      emoji: "🅿️",
      run: async () => {
        throw new Error("TDX parking request .../City/Taipei returned status 500");
      },
    },
    { key: "pharmacies", label: "藥局", emoji: "🏪", run: async () => [{ id: 2, name: "藥局 1", address: null, phone: null, lat: 2, lng: 2, distanceKm: 0.7 }] },
  ];

  const results = await aggregateNearbyTypes(tasks);
  const aed = results.find((r) => r.key === "aed");
  const parking = results.find((r) => r.key === "accessible-parking");
  const pharmacies = results.find((r) => r.key === "pharmacies");

  assert.equal(aed.status, "ok");
  assert.equal(aed.items.length, 1);
  assert.equal(pharmacies.status, "ok", "a type queried after the failing accessible-parking type must still succeed");
  assert.equal(pharmacies.items.length, 1);

  assert.equal(parking.status, "error");
  assert.deepEqual(parking.items, []);
  assert.ok(parking.error.includes("500"));
});

// ---------------------------------------------------------------------------
// 4. TOOL_CATALOG entry + both guide steps (acceptance criteria 2 and 3)
// ---------------------------------------------------------------------------

test('TOOL_CATALOG has an "accessible-parking" entry in the elder-care-welfare group', () => {
  const entry = getToolCatalogEntry("accessible-parking");
  assert.equal(entry.group, "elder-care-welfare");
  assert.ok(entry.keywords.length > 0);
});

test('"accessible-parking" has at least one inbound relatedSlugs reference (no link island)', () => {
  const inbound = TOOL_CATALOG.some((tool) => tool.relatedSlugs.includes("accessible-parking"));
  assert.ok(inbound, "some other tool must list accessible-parking in its relatedSlugs");
});

test('the "pregnancy-to-parenting" guide has a new step for accessible-parking (孕婦及親子車位)', () => {
  const guide = GUIDES.find((g) => g.slug === "pregnancy-to-parenting");
  assert.ok(guide, 'GUIDES must still contain "pregnancy-to-parenting"');

  const step = guide.steps.find((s) => s.toolSlug === "accessible-parking");
  assert.ok(step, 'pregnancy-to-parenting must have a step with toolSlug "accessible-parking"');
  assert.ok(step.caption.trim().length > 0);
  assert.ok(step.why.trim().length > 0);
  assert.ok(step.caption.includes("孕婦") || step.why.includes("孕婦"), "the step must be about the parent/child parking type");

  // Standing content rule: no persona labels, plain "使用者" instead.
  assert.ok(!step.caption.includes("觀光客") && !step.caption.includes("病患"));
  assert.ok(!step.why.includes("觀光客") && !step.why.includes("病患"));
});

test('the "disability-living" guide has a new step for accessible-parking (身障/復康巴士車位), and still has #468\'s audible-signals step', () => {
  const guide = GUIDES.find((g) => g.slug === "disability-living");
  assert.ok(guide, 'GUIDES must still contain "disability-living"');

  const parkingStep = guide.steps.find((s) => s.toolSlug === "accessible-parking");
  assert.ok(parkingStep, 'disability-living must have a step with toolSlug "accessible-parking"');
  assert.ok(parkingStep.caption.trim().length > 0);
  assert.ok(parkingStep.why.trim().length > 0);
  assert.ok(!parkingStep.caption.includes("觀光客") && !parkingStep.caption.includes("病患"));
  assert.ok(!parkingStep.why.includes("觀光客") && !parkingStep.why.includes("病患"));

  // #468's step must survive this ticket's edit untouched.
  const signalsStep = guide.steps.find((s) => s.toolSlug === "audible-signals");
  assert.ok(signalsStep, "disability-living must still have the #468 audible-signals step");
  assert.ok(signalsStep.why.includes("App"));
});

test("buildGuide resolves both new accessible-parking steps to the same real tool + href", () => {
  const pregnancyPage = buildGuide("pregnancy-to-parenting");
  const pregnancyStep = pregnancyPage.steps.find((s) => s.toolSlug === "accessible-parking");
  assert.ok(pregnancyStep);
  assert.equal(pregnancyStep.href, "/tools/accessible-parking");
  assert.equal(pregnancyStep.tool.slug, "accessible-parking");

  const disabilityPage = buildGuide("disability-living");
  const disabilityStep = disabilityPage.steps.find((s) => s.toolSlug === "accessible-parking");
  assert.ok(disabilityStep);
  assert.equal(disabilityStep.href, "/tools/accessible-parking");
});

test('getGuidesForTool("accessible-parking") reverse-resolves to both guides', () => {
  const guides = getGuidesForTool("accessible-parking");
  assert.deepEqual(
    guides.map((g) => g.slug).sort(),
    ["disability-living", "pregnancy-to-parenting"].sort(),
  );
});

// ---------------------------------------------------------------------------
// 5. Source-text inspection for the TDX client + sync wiring (real HTTP/DB)
// ---------------------------------------------------------------------------

test("app/(zh)/tools/accessible-parking/page.tsx exists, has metadata+canonical, and renders FacilitySearchContent", () => {
  const src = readSource("app", "(zh)", "tools", "accessible-parking", "page.tsx");
  assert.ok(src.includes("metadata") || src.includes("Metadata"));
  assert.ok(src.includes("canonical"));
  assert.ok(src.includes("<FacilitySearchContent"));
  assert.ok(src.includes('facilitySearchConfigs["accessible-parking"]'));
});

test("lib/server/facilities/sources/tdxParking.ts targets the swagger-confirmed OffStreet+OnStreet v1 paths and reuses TDX_BUS_CITIES", () => {
  const src = readSource("lib", "server", "facilities", "sources", "tdxParking.ts");
  assert.ok(src.includes("/v1/Parking/OffStreet/CarPark/City/"));
  assert.ok(src.includes("/v1/Parking/OffStreet/ParkingAvailability/City/"));
  assert.ok(src.includes("/v1/Parking/OnStreet/ParkingSegment/City/"));
  assert.ok(src.includes("/v1/Parking/OnStreet/ParkingSegmentAvailability/City/"));
  assert.ok(src.includes("TDX_BUS_CITIES"), "must reuse the existing 22-county map rather than re-declaring one");
  assert.ok(src.includes("getTdxToken"), "must use the shared TDX OAuth2 client, not a second token implementation");
  assert.ok(src.includes("Promise.allSettled"), "must isolate per-county/per-kind failures, matching the Bus/APS TDX client precedent");
  assert.ok(src.includes('facilityType: "accessible_parking"'), "must map into the facility_type this ticket registers everywhere else");
  assert.match(src, /export (async )?function fetchTdxAccessibleParking/);
});

test("tdxParking.ts only keeps SpaceType 7/9/10/13 (孕婦親子/身障汽車/身障機車/復康巴士), never 8 (婦女車位) or any other type", () => {
  const src = readSource("lib", "server", "facilities", "sources", "tdxParking.ts");
  // The allow-list object must map exactly these 4 keys to the 4 target labels.
  assert.ok(src.includes("7: \"孕婦及親子專用車位\""));
  assert.ok(src.includes("9: \"身心障礙汽車車位\""));
  assert.ok(src.includes("10: \"身心障礙機車車位\""));
  assert.ok(src.includes("13: \"復康巴士\""));
  assert.ok(!src.includes("8: \"婦女車位\""), "SpaceType 8 (婦女車位) must not be in the allow-list — the issue names only 4 types");
});

test("lib/server/facilities/runSync.ts registers the tdx_parking source", () => {
  const src = readSource("lib", "server", "facilities", "runSync.ts");
  assert.ok(src.includes("fetchTdxAccessibleParking"));
  assert.match(src, /key:\s*"tdx_parking"/);
});
