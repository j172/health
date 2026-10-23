import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #466 ("「我附近」頁面：一次定位看全部急用點位", parent #438 §F).
//
// lib/server/nearby/{registry,aggregate}.ts and lib/server/content/nearbyContent.ts
// are plain .ts with no DB access and no JSX, so this file dynamically imports and
// exercises them directly (same loader shim as lib/server/tools/navModel.test.mjs /
// tests/llms-pages-444.test.mjs). lib/server/nearby/queries.ts (real facilities/ER/
// shelter DB calls) and app/api/nearby/route.ts, app/nearby/page.tsx, and the two
// llms.txt/markdown route.ts files are DB-backed or JSX — verified via source-text
// inspection instead, matching tests/llms-pages-444.test.mjs's and
// tests/mobile-bottom-nav-473.test.mjs's established convention for this repo.

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
  // lib/i18n/dictionary.ts imports the locale files relying on
  // TypeScript's resolveJsonModule (as every other .ts file importing a
  // .json does in this repo) — no `with { type: "json" }` import
  // attribute. Plain `node --test` requires that attribute for the
  // *default* JSON load path, so this intercepts .json URLs and returns
  // their parsed-as-JSON source directly instead, sidestepping the
  // attribute requirement entirely (issue #488 pulled this chain in via
  // nearbyContent.ts's new locale-aware adapter — same hook as
  // tests/i18n-routing-485.test.mjs).
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { aggregateNearbyTypes } = await import("../lib/server/nearby/aggregate.ts");
const {
  NEARBY_DEFAULT_TYPES,
  NEARBY_MORE_TYPES,
  NEARBY_DEFAULT_TYPE_KEYS,
  NEARBY_MAX_TYPES_PER_REQUEST,
  findNearbyTypeDef,
} = await import("../lib/server/nearby/registry.ts");
const { buildNearbyLlmsPageContent, NEARBY_SUMMARY } = await import(
  "../lib/server/content/nearbyContent.ts"
);
const { buildLlmsTxt, buildLlmsMarkdown } = await import("../lib/server/content/llmsPage.ts");

const BASE_URL = "https://health.j172.tw";
const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

// ---------------------------------------------------------------------------
// 1. Registry: the 8 defaults + "更多類型" expansion, single source of truth
// ---------------------------------------------------------------------------

test("NEARBY_DEFAULT_TYPES has exactly the 8 types sorted strictly by urgency level (issue #800, #801)", () => {
  assert.equal(NEARBY_DEFAULT_TYPES.length, 8);
  const expectedOrder = [
    "aed",
    "er",
    "police-stations",
    "shelter",
    "clinics",
    "pharmacies",
    "public-toilets",
    "cool-spots",
  ];
  assert.deepEqual(
    NEARBY_DEFAULT_TYPES.map((d) => d.key),
    expectedOrder,
    "defaults must match the exact urgency order"
  );
  for (const def of NEARBY_DEFAULT_TYPES) {
    assert.ok(def.toolSlug, `default "${def.key}" must define a toolSlug`);
  }
});

test("the 5 facilitySearchConfigs-derived defaults match their config definitions", async () => {
  const { facilitySearchConfigs } = await import("../app/(zh)/tools/facilityConfigs.ts");
  for (const def of NEARBY_DEFAULT_TYPES) {
    if (def.kind !== "facility" || def.key === "police-stations") continue;
    const cfg = facilitySearchConfigs[def.toolSlug];
    assert.ok(cfg, `facilitySearchConfigs must have an entry for "${def.toolSlug}"`);
    assert.equal(def.facilityType, cfg.facilityType);
    assert.equal(def.emoji, cfg.emoji);
    assert.equal(def.label, cfg.title);
  }
});

test("er, shelter, and police-stations declare their specialized data mappings", () => {
  const er = NEARBY_DEFAULT_TYPES.find((d) => d.key === "er");
  const shelter = NEARBY_DEFAULT_TYPES.find((d) => d.key === "shelter");
  const police = NEARBY_DEFAULT_TYPES.find((d) => d.key === "police-stations");

  assert.equal(er.kind, "er");
  assert.equal(er.toolSlug, "er-status");

  assert.equal(shelter.kind, "shelter");
  assert.equal(shelter.toolSlug, "disaster-map");

  assert.equal(police.kind, "facility");
  assert.equal(police.facilityType, "police_station");
  assert.equal(police.toolSlug, "child-safety-spots");
});

test('NEARBY_MORE_TYPES excludes every default key ("更多類型" never re-offers a default)', () => {
  const defaultKeys = new Set(NEARBY_DEFAULT_TYPES.map((d) => d.key));
  for (const def of NEARBY_MORE_TYPES) {
    assert.ok(!defaultKeys.has(def.key), `"${def.key}" is a default and must not also appear in NEARBY_MORE_TYPES`);
  }
  // The issue's own research note: ~30 /tools facility-search pages total, 6 of
  // which are defaults here, so "more types" should be a sizeable remainder.
  assert.ok(NEARBY_MORE_TYPES.length >= 15, "NEARBY_MORE_TYPES must contain the bulk of the other /tools facility pages");
});

test("findNearbyTypeDef resolves both default and more-type keys, and returns undefined for an unknown key", () => {
  assert.equal(findNearbyTypeDef("aed")?.key, "aed");
  assert.equal(findNearbyTypeDef(NEARBY_MORE_TYPES[0].key)?.key, NEARBY_MORE_TYPES[0].key);
  assert.equal(findNearbyTypeDef("not-a-real-type"), undefined);
});

test("NEARBY_DEFAULT_TYPE_KEYS matches NEARBY_DEFAULT_TYPES exactly, and the per-request cap equals 8", () => {
  assert.deepEqual(NEARBY_DEFAULT_TYPE_KEYS, NEARBY_DEFAULT_TYPES.map((d) => d.key));
  assert.equal(NEARBY_MAX_TYPES_PER_REQUEST, 8);
});

// ---------------------------------------------------------------------------
// 2. aggregateNearbyTypes: per-type failure isolation (core acceptance
//    criterion — "任一類型查詢失敗不影響其他類型正常顯示")
// ---------------------------------------------------------------------------

test("aggregateNearbyTypes: one task rejecting does not affect any other task's result", async () => {
  const tasks = [
    { key: "a", label: "A", emoji: "🅰️", run: async () => [{ id: 1, name: "foo", address: null, phone: null, lat: 1, lng: 1, distanceKm: 0.5 }] },
    { key: "b", label: "B", emoji: "🅱️", run: async () => { throw new Error("boom"); } },
    { key: "c", label: "C", emoji: "🅾️", run: async () => [{ id: 2, name: "bar", address: null, phone: null, lat: 2, lng: 2, distanceKm: 1.2 }] },
  ];

  const results = await aggregateNearbyTypes(tasks);
  assert.equal(results.length, 3, "all 3 tasks must produce a result, none silently dropped");

  const a = results.find((r) => r.key === "a");
  const b = results.find((r) => r.key === "b");
  const c = results.find((r) => r.key === "c");

  assert.equal(a.status, "ok");
  assert.equal(a.items.length, 1);
  assert.equal(c.status, "ok", "the type after the failing one must still succeed");
  assert.equal(c.items.length, 1);

  assert.equal(b.status, "error", "the failing type must be reported as an error, not crash the whole response");
  assert.deepEqual(b.items, [], "a failed type's items must be empty, not undefined or stale data");
  assert.ok(b.error && b.error.includes("boom"), "the error message must be surfaced, not swallowed");
});

test("aggregateNearbyTypes: all 8 tasks failing still returns 8 distinct error results (never throws itself)", async () => {
  const tasks = Array.from({ length: 8 }, (_, i) => ({
    key: `t${i}`,
    label: `T${i}`,
    emoji: "❓",
    run: async () => { throw new Error(`fail-${i}`); },
  }));
  const results = await aggregateNearbyTypes(tasks);
  assert.equal(results.length, 8);
  assert.ok(results.every((r) => r.status === "error"));
});

test("aggregateNearbyTypes: a rejection with a non-Error reason is still converted to a string, not left as an object", async () => {
  const results = await aggregateNearbyTypes([
    { key: "x", label: "X", emoji: "❌", run: async () => { throw "plain string rejection"; } },
  ]);
  assert.equal(results[0].status, "error");
  assert.equal(typeof results[0].error, "string");
});

// ---------------------------------------------------------------------------
// 3. llms.txt / markdown generator — reusing the same registry, not a copy
// ---------------------------------------------------------------------------

test("buildNearbyLlmsPageContent produces valid llms.txt grammar", () => {
  const content = buildNearbyLlmsPageContent(BASE_URL);
  assert.equal(content.summary, NEARBY_SUMMARY);
  const text = buildLlmsTxt(content);
  assert.ok(text.startsWith(`# ${content.title}\n`));
  assert.ok(text.includes(`\n> ${NEARBY_SUMMARY}\n`));
});

test("buildNearbyLlmsPageContent's full Markdown lists all 8 defaults and the more-types, with no nav/footer markup", () => {
  const content = buildNearbyLlmsPageContent(BASE_URL);
  const markdown = buildLlmsMarkdown(content);
  for (const def of NEARBY_DEFAULT_TYPES) {
    assert.ok(markdown.includes(def.label), `markdown must mention default type "${def.label}"`);
  }
  for (const def of NEARBY_MORE_TYPES.slice(0, 3)) {
    assert.ok(markdown.includes(def.label), `markdown must mention more-type "${def.label}"`);
  }
  for (const forbidden of ["<nav", "<footer", "<script", "StabloHeader", "StabloFooter"]) {
    assert.ok(!markdown.includes(forbidden), `markdown must not contain "${forbidden}"`);
  }
});

test("buildNearbyLlmsPageContent's tool-backed sources link to the real /tools/<slug> pages", () => {
  const content = buildNearbyLlmsPageContent(BASE_URL);
  const aedSource = content.sources.find((s) => s.title.includes("AED"));
  assert.ok(aedSource?.url?.startsWith(`${BASE_URL}/tools/`));
});

// ---------------------------------------------------------------------------
// 4. Source-text inspection for JSX / DB-backed files
// ---------------------------------------------------------------------------

test("app/(zh)/nearby/page.tsx declares its llms.txt + markdown <link> tags and renders NearbyContent", () => {
  const src = readSource("app", "(zh)", "nearby", "page.tsx");
  assert.ok(src.includes('href="/nearby/llms.txt"'));
  assert.ok(src.includes('href="/nearby/markdown"'));
  assert.ok(src.includes("<NearbyContent"));
});

for (const [routeDir, adapterFn, generatorFn, contentType] of [
  [["app", "(zh)", "nearby", "llms.txt", "route.ts"], "buildNearbyLlmsPageContent", "buildLlmsTxt", "text/plain"],
  [["app", "(zh)", "nearby", "markdown", "route.ts"], "buildNearbyLlmsPageContent", "buildLlmsMarkdown", "text/markdown"],
]) {
  test(`${routeDir.join("/")} exists and calls ${adapterFn} + ${generatorFn}`, () => {
    const fullPath = path.join(ROOT_DIR, ...routeDir);
    assert.ok(fs.existsSync(fullPath), `${fullPath} must exist`);
    const src = fs.readFileSync(fullPath, "utf-8");
    assert.ok(src.includes(adapterFn));
    assert.ok(src.includes(generatorFn));
    assert.ok(src.includes(contentType));
  });
}

test("app/api/nearby/route.ts validates lat/lng, defaults to the 8 types, and caps a single request at 8 types", () => {
  const src = readSource("app", "api", "nearby", "route.ts");
  assert.ok(src.includes("fetchNearbyResults"), "must call the shared aggregation function, not a re-derivation");
  assert.ok(src.includes("NEARBY_DEFAULT_TYPE_KEYS"), "must fall back to the 8 defaults when no types= param is given");
  assert.ok(src.includes("NEARBY_MAX_TYPES_PER_REQUEST"), "must enforce the 8-types-per-request cap from the shared constant");
  assert.match(src, /status:\s*400/, "must reject invalid/missing lat or lng with a 400, not silently proceed");
});

test("components/Nearby/NearbyContent.tsx uses the shared useSharedGeolocation hook, not the older silently-defaulting useGeolocation", () => {
  const src = readSource("components", "Nearby", "NearbyContent.tsx");
  assert.ok(src.includes("useSharedGeolocation"), "must use the #477 shared hook");
  assert.ok(
    !/from\s+"@\/components\/Facilities\/useGeolocation"/.test(src),
    "must not import the older per-page useGeolocation hook (silently defaults to Taipei 101 on denial/timeout)",
  );
  // Never a hardcoded fallback coordinate standing in for "we couldn't get a location" —
  // the exact silent-default bug class this issue's acceptance criteria call out.
  for (const forbidden of ["25.033", "121.5654", "GEO_DEFAULTS"]) {
    assert.ok(!src.includes(forbidden), `must not contain a hardcoded default coordinate ("${forbidden}")`);
  }
});

test("components/Nearby/NearbyContent.tsx renders a manual county picker gated on needsManualSelection, not an automatic fallback", () => {
  const src = readSource("components", "Nearby", "NearbyContent.tsx");
  assert.ok(src.includes("needsManualSelection"), "must branch on the hook's explicit denied/timeout/unsupported signal");
  assert.ok(src.includes("CountyDistrictPicker"), "must offer a manual county/district picker as the fallback UI");
  assert.ok(src.includes("geolocation.refresh"), "must offer a way to retry geolocation, not just a one-shot default");
});

test("components/Nearby/NearbyContent.tsx's 更多類型 expansion loads one type at a time, not the whole remaining list", () => {
  const src = readSource("components", "Nearby", "NearbyContent.tsx");
  assert.ok(src.includes("loadMoreType"), "must have a per-type loader function");
  // The per-type loader must issue a request scoped to a single key, not join() the whole list.
  const loaderBody = src.slice(src.indexOf("const loadMoreType"), src.indexOf("const loadMoreType") + 1200);
  assert.ok(/types:\s*key/.test(loaderBody), "the more-types loader must request exactly one type per call");
  assert.ok(!/NEARBY_MORE_TYPES\.map\(\(def\) => def\.key\)\.join/.test(src), "must not prefetch all more-types keys joined into one request");
});

test("components/Nearby/NearbyContent.tsx requests 5 items, renders 2 columns, provides Google Maps navigation links, and adds 'see more' links (issue #800, #802)", () => {
  const src = readSource("components", "Nearby", "NearbyContent.tsx");

  // 1. limit: "5"
  assert.ok(src.includes('limit: "5"'), "must request limit=5");

  // 2. 2-column layout (1 row 2 cards)
  assert.ok(src.includes("grid-cols-1 gap-4 md:grid-cols-2"), "must use 2-column layout to avoid text truncation");

  // 3. Google Maps navigation deep links
  assert.ok(src.includes("buildGoogleMapsDirUrl"), "must wrap items with buildGoogleMapsDirUrl");
  assert.ok(src.includes('target="_blank"'), "must open navigation in new window");
  assert.ok(src.includes('rel="noopener noreferrer"'), "must specify noopener noreferrer");

  // 4. See more tool link
  assert.ok(src.includes("nearbyPage.seeMoreCategory"), "must use seeMoreCategory translation key");
  assert.ok(src.includes("toolHref"), "must render toolHref link");
});
