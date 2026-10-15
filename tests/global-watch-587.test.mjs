import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #587 (parent #583): the globe shell's "項目 → 地球資料" pure-logic
// seams (basemap label fallback, reduced-motion camera-transition decision,
// WebGL-detection branching). None of these three modules has a runtime
// "@/" import (their only "@/"-prefixed import is `import type`, which the
// TS/Node type-stripping transform erases entirely before execution) — but
// this hook is still registered, matching tests/baseMap.test.mjs's
// precedent, in case a future edit adds a real one.
const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const {
  resolveFeatureLabel,
  buildLabelFieldExpression,
  LOCALE_NAME_FIELD,
  DEFAULT_NAME_FIELD,
} = await import("../lib/tools/globeWatch/basemapLabels.ts");
const { resolveCameraTransition, resolveFlyDurationMs, AUTO_ROTATE_ENABLED } = await import(
  "../lib/tools/globeWatch/motion.ts"
);
const { detectWebglSupport } = await import("../lib/tools/globeWatch/webgl.ts");
const {
  OPENFREEMAP_STYLE_URL,
  GIBS_SATELLITE_TILE_URL,
  OPENFREEMAP_ATTRIBUTION_HTML,
  GIBS_ATTRIBUTION_HTML,
} = await import("../lib/tools/globeWatch/basemapStyles.ts");
const { TAIWAN_DEFAULT_VIEW } = await import("../lib/tools/globeWatch/defaultView.ts");

// ---------------------------------------------------------------------------
// resolveFeatureLabel / buildLabelFieldExpression
// AC: "底圖標籤依頁面語言（zh/en/ja/ko）挑選對應欄位，查不到退回原文"
// ---------------------------------------------------------------------------

test("resolveFeatureLabel picks the locale-specific OpenMapTiles name field for each of the 4 supported locales", () => {
  const properties = {
    name: "東京",
    "name:zh-Hant": "東京",
    "name:en": "Tokyo",
    "name:ja": "東京",
    "name:ko": "도쿄",
  };
  assert.equal(resolveFeatureLabel(properties, "zh-TW"), "東京");
  assert.equal(resolveFeatureLabel(properties, "en"), "Tokyo");
  assert.equal(resolveFeatureLabel(properties, "ja"), "東京");
  assert.equal(resolveFeatureLabel(properties, "ko"), "도쿄");
});

test("resolveFeatureLabel falls back to the bare `name` field when the locale-specific field is missing", () => {
  const properties = { name: "Local Name Only" };
  assert.equal(resolveFeatureLabel(properties, "en"), "Local Name Only");
  assert.equal(resolveFeatureLabel(properties, "ja"), "Local Name Only");
  assert.equal(resolveFeatureLabel(properties, "ko"), "Local Name Only");
  assert.equal(resolveFeatureLabel(properties, "zh-TW"), "Local Name Only");
});

test("resolveFeatureLabel falls back to `name` when the locale field is present but blank/whitespace", () => {
  const properties = { "name:en": "   ", name: "本地名稱" };
  assert.equal(resolveFeatureLabel(properties, "en"), "本地名稱");
});

test("resolveFeatureLabel never throws and returns undefined when there is no usable name at all", () => {
  assert.equal(resolveFeatureLabel(null, "en"), undefined);
  assert.equal(resolveFeatureLabel(undefined, "zh-TW"), undefined);
  assert.equal(resolveFeatureLabel({}, "ja"), undefined);
  assert.equal(resolveFeatureLabel({ "name:en": 123 }, "en"), undefined);
});

test("LOCALE_NAME_FIELD covers exactly the site's 4 supported locales with the documented #583 field names", () => {
  assert.deepEqual(LOCALE_NAME_FIELD, {
    "zh-TW": "name:zh-Hant",
    en: "name:en",
    ja: "name:ja",
    ko: "name:ko",
  });
  assert.equal(DEFAULT_NAME_FIELD, "name");
});

test("buildLabelFieldExpression returns a MapLibre coalesce(locale-field, name) expression for en/ja/ko", () => {
  assert.deepEqual(buildLabelFieldExpression("en"), ["coalesce", ["get", "name:en"], ["get", "name"]]);
  assert.deepEqual(buildLabelFieldExpression("ja"), ["coalesce", ["get", "name:ja"], ["get", "name"]]);
  assert.deepEqual(buildLabelFieldExpression("ko"), ["coalesce", ["get", "name:ko"], ["get", "name"]]);
  assert.deepEqual(buildLabelFieldExpression("zh-TW"), ["coalesce", ["get", "name:zh-Hant"], ["get", "name"]]);
});

// ---------------------------------------------------------------------------
// resolveCameraTransition / resolveFlyDurationMs / AUTO_ROTATE_ENABLED
// AC: "系統開啟減少動態效果時，不自動旋轉、flyTo 動畫改為瞬間跳轉"
// ---------------------------------------------------------------------------

test("resolveCameraTransition jumps instantly under reduced motion, flies otherwise", () => {
  assert.equal(resolveCameraTransition(true), "jump");
  assert.equal(resolveCameraTransition(false), "fly");
});

test("resolveFlyDurationMs collapses to 0 under reduced motion, keeps the base duration otherwise", () => {
  assert.equal(resolveFlyDurationMs(true, 1600), 0);
  assert.equal(resolveFlyDurationMs(false, 1600), 1600);
  assert.equal(resolveFlyDurationMs(false, 0), 0);
});

test("the globe never auto-rotates, independent of the reduced-motion setting (no idle auto-rotate feature exists in this skeleton)", () => {
  assert.equal(AUTO_ROTATE_ENABLED, false);
});

// ---------------------------------------------------------------------------
// detectWebglSupport
// AC: "偵測不到 WebGL 時只顯示退回說明文字，不嘗試載入地球、不拋出錯誤"
// ---------------------------------------------------------------------------

test("detectWebglSupport returns true/false straight from the probe when it doesn't throw", () => {
  assert.equal(detectWebglSupport(() => true), true);
  assert.equal(detectWebglSupport(() => false), false);
});

test("detectWebglSupport never throws, even when the probe itself throws (e.g. getContext disabled by browser policy)", () => {
  assert.doesNotThrow(() => {
    const result = detectWebglSupport(() => {
      throw new Error("WebGL context creation blocked");
    });
    assert.equal(result, false);
  });
});

test("detectWebglSupport coerces a truthy non-boolean probe result (e.g. a real WebGLRenderingContext object) to true", () => {
  assert.equal(detectWebglSupport(() => ({})), true);
  assert.equal(detectWebglSupport(() => null), false);
  assert.equal(detectWebglSupport(() => undefined), false);
});

// ---------------------------------------------------------------------------
// basemapStyles / defaultView: plain-constant regression guards, same
// convention as tests/baseMap.test.mjs's checks on tileConfig.ts's exports.
// ---------------------------------------------------------------------------

test("basemap style constants use the documented key-free OpenFreeMap and NASA GIBS endpoints", () => {
  assert.match(OPENFREEMAP_STYLE_URL, /^https:\/\/tiles\.openfreemap\.org\//);
  assert.doesNotMatch(OPENFREEMAP_STYLE_URL, /[?&](key|token|api_key)=/i);
  assert.match(GIBS_SATELLITE_TILE_URL, /^https:\/\/gibs\.earthdata\.nasa\.gov\//);
  assert.doesNotMatch(GIBS_SATELLITE_TILE_URL, /[?&](key|token|api_key)=/i);
  assert.match(OPENFREEMAP_ATTRIBUTION_HTML, /OpenFreeMap/);
  assert.match(GIBS_ATTRIBUTION_HTML, /NASA/);
});

test("TAIWAN_DEFAULT_VIEW centers roughly on Taiwan with a zoom wide enough to show the western Pacific", () => {
  const [lng, lat] = TAIWAN_DEFAULT_VIEW.center;
  assert.ok(lng > 118 && lng < 124, `expected Taiwan-ish longitude, got ${lng}`);
  assert.ok(lat > 20 && lat < 27, `expected Taiwan-ish latitude, got ${lat}`);
  assert.ok(TAIWAN_DEFAULT_VIEW.zoom > 0 && TAIWAN_DEFAULT_VIEW.zoom < 5, `expected a wide, western-Pacific-scale zoom, got ${TAIWAN_DEFAULT_VIEW.zoom}`);
});

// ---------------------------------------------------------------------------
// Component wiring — source-text inspection, same convention as
// tests/baseMap.test.mjs for the parts that need a real browser (no JSX/DOM
// rendering harness exists in this repo's test runner).
// ---------------------------------------------------------------------------

const ROOT_DIR = path.join(fileURLToPath(REPO_ROOT));
const globeSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchGlobe.tsx"),
  "utf-8",
);
const clientSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchClient.tsx"),
  "utf-8",
);
const pageSrc = fs.readFileSync(
  path.join(ROOT_DIR, "app", "(zh)", "tools", "global-watch", "page.tsx"),
  "utf-8",
);

test("GlobeWatchClient loads the globe component via next/dynamic with ssr:false (AC: 動態 import、不出現在首次載入的 JS bundle)", () => {
  assert.match(clientSrc, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/GlobeWatchGlobe"\)/);
  assert.match(clientSrc, /ssr:\s*false/);
});

test("GlobeWatchClient never renders the globe (and therefore never triggers its dynamic import) before the WebGL probe resolves or when it resolves false", () => {
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*<GlobeWatchGlobe/);
  assert.match(clientSrc, /webglSupported\s*===\s*false\s*&&/);
  assert.match(clientSrc, /useState<boolean \| null>\(null\)/);
});

test("GlobeWatchClient's outer frame keeps one fixed aspect ratio across all three states (AC: CLS)", () => {
  const frameMatch = clientSrc.match(/<div\s+className="([^"]*aspect-\[16\/10\][^"]*)"/);
  assert.ok(frameMatch, "expected a single wrapping <div> with a fixed aspect-[16/10] className");
});

test("GlobeWatchClient wires prefers-reduced-motion in via usePrefersReducedMotion", () => {
  assert.match(clientSrc, /usePrefersReducedMotion\(\)/);
  assert.match(clientSrc, /reducedMotion=\{reducedMotion\}/);
});

test("GlobeWatchGlobe uses MapLibre's globe projection via the typed setProjection API, not a constructor option that needs a ts-expect-error", () => {
  assert.match(globeSrc, /setProjection\(\{\s*type:\s*"globe"\s*\}\)/);
  assert.doesNotMatch(globeSrc, /ts-expect-error/);
});

test("GlobeWatchGlobe has a '回到台灣' reset control wired to resolveCameraTransition/resolveFlyDurationMs", () => {
  assert.match(globeSrc, /回到台灣/);
  assert.match(globeSrc, /resolveCameraTransition\(reducedMotion\)/);
  assert.match(globeSrc, /resolveFlyDurationMs\(reducedMotion/);
  assert.match(globeSrc, /map\.jumpTo\(TAIWAN_DEFAULT_VIEW\)/);
  assert.match(globeSrc, /map\.flyTo\(/);
});

test("GlobeWatchGlobe has a vector/satellite basemap toggle wired to the GIBS raster source", () => {
  assert.match(globeSrc, /setBasemapMode/);
  assert.match(globeSrc, /SATELLITE_RASTER_SOURCE_ID/);
  assert.match(globeSrc, /SATELLITE_RASTER_LAYER_ID/);
});

test("GlobeWatchGlobe applies the locale label expression from basemapLabels.ts rather than hand-rolling its own field lookup", () => {
  assert.match(globeSrc, /import \{ buildLabelFieldExpression \} from "@\/lib\/tools\/globeWatch\/basemapLabels"/);
  assert.match(globeSrc, /buildLabelFieldExpression\(locale\)/);
});

test("the /tools/global-watch page renders the client globe shell inside ToolPageShell and credits OpenFreeMap + NASA GIBS + MapLibre", () => {
  assert.match(pageSrc, /<GlobeWatchClient\s*\/>/);
  assert.match(pageSrc, /ToolPageShell/);
  assert.match(pageSrc, /OpenFreeMap/);
  assert.match(pageSrc, /NASA EOSDIS GIBS/);
  assert.match(pageSrc, /MapLibre/);
});

// ---------------------------------------------------------------------------
// Catalog / package.json plumbing
// ---------------------------------------------------------------------------

test("TOOL_CATALOG has a minimal global-watch entry in the disaster-alerts group", async () => {
  const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
  const entry = TOOL_CATALOG.find((tool) => tool.slug === "global-watch");
  assert.ok(entry, "expected a global-watch catalog entry");
  assert.equal(entry.group, "disaster-alerts");
  assert.equal(entry.title, "全球動態地球");
  assert.ok(entry.keywords.length > 0);
});

test("en/ja/ko locale files have a catalog.global-watch translation (required by tests/issue-450-tool-name-i18n-coverage.test.mjs)", () => {
  for (const localeFile of ["en.json", "ja.json", "ko.json"]) {
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "locales", localeFile), "utf-8"));
    assert.ok(
      typeof dict.catalog?.["global-watch"] === "string" && dict.catalog["global-watch"].length > 0,
      `${localeFile} is missing catalog.global-watch`,
    );
  }
});

test("package.json declares maplibre-gl as a dependency", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf-8"));
  assert.ok(pkg.dependencies?.["maplibre-gl"], "expected maplibre-gl in package.json dependencies");
});
