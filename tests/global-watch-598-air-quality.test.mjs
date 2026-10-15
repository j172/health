import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #598 (parent #583, phase 4 — 全球空品／global air quality): the
// pure tile-url builder + legend/attribution constants, plus source-text/
// structural assertions for the pages and components, following the same
// loader-hook convention tests/global-watch-587.test.mjs established.
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
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const ROOT_DIR = path.join(fileURLToPath(REPO_ROOT));
const readSrc = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

const { buildWaqiTileUrl, WAQI_ATTRIBUTION_HTML, AQI_LEGEND, WAQI_AQI_LAYER, WAQI_TILE_SIZE } = await import(
  "../lib/tools/globeWatch/airQualityTiles.ts"
);

// ---------------------------------------------------------------------------
// buildWaqiTileUrl — AC: token 透過 WAQI_TOKEN 環境變數注入前端，不寫死在原始碼
// ---------------------------------------------------------------------------

test("buildWaqiTileUrl interpolates the given token into the query string, never a literal/hard-coded token", () => {
  const url = buildWaqiTileUrl("abc123TESTTOKEN");
  assert.match(url, /token=abc123TESTTOKEN/);
  assert.match(url, /^https:\/\/tiles\.waqi\.info\/tiles\//);
  assert.ok(url.includes(WAQI_AQI_LAYER));
});

test("buildWaqiTileUrl preserves the literal {z}/{x}/{y} placeholders for MapLibre to substitute, not interpolated here", () => {
  const url = buildWaqiTileUrl("tok");
  assert.match(url, /\{z\}\/\{x\}\/\{y\}\.png/);
});

test("buildWaqiTileUrl URL-encodes the token", () => {
  const url = buildWaqiTileUrl("weird token/with&chars");
  assert.ok(!url.includes("weird token/with&chars"), "raw unsafe token must not appear verbatim in the URL");
  assert.match(url, /token=weird%20token%2Fwith%26chars/);
});

test("WAQI_TILE_SIZE is the standard 256px XYZ tile size", () => {
  assert.equal(WAQI_TILE_SIZE, 256);
});

// ---------------------------------------------------------------------------
// AQI_LEGEND / attribution
// ---------------------------------------------------------------------------

test("AQI_LEGEND has exactly 6 bands covering the full US EPA AQI scale with distinct colors, ending unbounded", () => {
  assert.equal(AQI_LEGEND.length, 6);
  assert.equal(AQI_LEGEND[0].min, 0);
  assert.equal(AQI_LEGEND.at(-1).max, null, "the top band must be unbounded (301+)");
  const colors = new Set(AQI_LEGEND.map((l) => l.color));
  assert.equal(colors.size, 6, "every band must have a distinct color");
  for (const entry of AQI_LEGEND) {
    assert.ok(typeof entry.labelZh === "string" && entry.labelZh.trim().length > 0);
  }
});

test("WAQI_ATTRIBUTION_HTML credits waqi.info with a real outbound link (AC: 頁面顯示 WAQI 署名)", () => {
  assert.match(WAQI_ATTRIBUTION_HTML, /waqi\.info/);
  assert.match(WAQI_ATTRIBUTION_HTML, /<a href="https:\/\/waqi\.info\/[^"]*"/);
});

// ---------------------------------------------------------------------------
// Source-text / structural assertions — no real browser/DOM harness in this
// repo, same convention as tests/global-watch-587.test.mjs /
// tests/global-watch-588-structure.test.mjs / tests/global-watch-589-epidemics.test.mjs
// ---------------------------------------------------------------------------

const envSrc = readSrc("lib", "server", "config", "env.ts");
const envExampleSrc = readSrc(".env.example");
const globeSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchAirQualityGlobe.tsx");
const clientSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchAirQualityClient.tsx");
const zhPageSrc = readSrc("app", "(zh)", "tools", "global-watch", "air-quality", "page.tsx");
const localePageSrc = readSrc("app", "[locale]", "tools", "global-watch", "air-quality", "page.tsx");
const itemsRegistrySrc = readSrc("lib", "tools", "globeWatch", "items.ts");

test("env.ts exposes waqiToken using the same optional-credential convention as the other fields, reading WAQI_TOKEN", () => {
  assert.match(envSrc, /waqiToken:\s*process\.env\.WAQI_TOKEN\?\.trim\(\)\s*\|\|\s*null/);
});

test(".env.example documents WAQI_TOKEN", () => {
  assert.match(envExampleSrc, /WAQI_TOKEN=/);
});

test("no source file hard-codes a real-looking WAQI token value — buildWaqiTileUrl always takes it as a parameter", () => {
  for (const src of [globeSrc, clientSrc, zhPageSrc, localePageSrc]) {
    assert.doesNotMatch(src, /tiles\.waqi\.info\/tiles\/[^"'`]*token=[^{"'`][^"'`]*/, "a literal, pre-filled token must never appear in a tile URL string");
  }
});

test("GlobeWatchAirQualityGlobe builds its raster source tiles array from buildWaqiTileUrl(token), a function parameter never a module constant", () => {
  assert.match(globeSrc, /tiles:\s*\[buildWaqiTileUrl\(token\)\]/);
  assert.match(globeSrc, /token:\s*string/);
});

test("GlobeWatchAirQualityGlobe uses MapLibre's globe projection", () => {
  assert.match(globeSrc, /setProjection\(\{\s*type:\s*"globe"\s*\}\)/);
});

test("GlobeWatchAirQualityClient loads the globe via next/dynamic with ssr:false, gated behind both the WebGL probe and a configured token", () => {
  assert.match(clientSrc, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/GlobeWatchAirQualityGlobe"\)/);
  assert.match(clientSrc, /ssr:\s*false/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*hasToken/);
  assert.match(clientSrc, /webglSupported\s*===\s*false\s*&&/);
  assert.match(clientSrc, /variant="unconfigured"/);
});

test("GlobeWatchAirQualityClient never renders the globe when waqiToken is falsy, even with WebGL support", () => {
  assert.match(clientSrc, /const hasToken = Boolean\(waqiToken\)/);
  assert.match(clientSrc, /webglSupported === true && !hasToken/);
});

test("the zh air-quality page reads env.waqiToken server-side and passes it straight through as a prop (not a NEXT_PUBLIC_ build-time var — this repo has none)", () => {
  assert.match(zhPageSrc, /import \{ env \} from "@\/lib\/server\/config\/env"/);
  assert.match(zhPageSrc, /waqiToken=\{env\.waqiToken\}/);
  const codeOnly = zhPageSrc
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  assert.doesNotMatch(codeOnly, /NEXT_PUBLIC_/);
});

test("the zh air-quality page has its own metadata (title/description/keywords/canonical), distinct from the root global-watch shell page", () => {
  assert.match(zhPageSrc, /canonical = `\$\{getBaseUrl\(\)\}\/tools\/global-watch\/air-quality`/);
  assert.match(zhPageSrc, /export const metadata: Metadata = \{/);
  assert.match(zhPageSrc, /title:\s*"全球空品/);
  assert.doesNotMatch(zhPageSrc, /title:\s*catalogEntry\.title,\s*$/m);
});

test("the zh air-quality page shows WAQI attribution text and a link to /tools/aqi", () => {
  assert.match(zhPageSrc, /WAQI_ATTRIBUTION_HTML/);
  assert.match(zhPageSrc, /href="\/tools\/aqi"/);
});

test("the zh air-quality page renders the shared item-switcher tab bar and the air-quality globe client", () => {
  assert.match(zhPageSrc, /<GlobeWatchItemTabs\s*\/>/);
  assert.match(zhPageSrc, /<GlobeWatchAirQualityClient\s/);
});

test("the locale air-quality page follows the earthquakes/epidemics locale-page pattern: generateStaticParams over PATH_LOCALES, notFound() guard, and hreflang alternates", () => {
  assert.match(localePageSrc, /export function generateStaticParams\(\)/);
  assert.match(localePageSrc, /PATH_LOCALES\.map/);
  assert.match(localePageSrc, /if \(!isPathLocale\(locale\)\) notFound\(\);/);
  assert.match(localePageSrc, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(localePageSrc, /CANONICAL_PATH = "\/tools\/global-watch\/air-quality"/);
});

test("the locale air-quality page has complete en/ja/ko title+description (never falling back to Chinese) and links to the localized /tools/aqi", () => {
  for (const locale of ["en", "ja", "ko"]) {
    assert.match(localePageSrc, new RegExp(`${locale}:\\s*\\{`));
  }
  assert.doesNotMatch(localePageSrc, /title:\s*""/);
  assert.match(localePageSrc, /buildLocalizedPath\("\/tools\/aqi", locale\)/);
});

test("the air-quality item is registered in the shared GLOBE_WATCH_ITEMS registry alongside earthquakes and epidemics", async () => {
  assert.match(itemsRegistrySrc, /key:\s*"air-quality"/);
  assert.match(itemsRegistrySrc, /path:\s*"\/tools\/global-watch\/air-quality"/);

  const { GLOBE_WATCH_ITEMS } = await import("../lib/tools/globeWatch/items.ts");
  const airQuality = GLOBE_WATCH_ITEMS.find((item) => item.key === "air-quality");
  assert.ok(airQuality, "expected an air-quality entry in GLOBE_WATCH_ITEMS");
  assert.equal(airQuality.path, "/tools/global-watch/air-quality");
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    const text = airQuality.label?.[locale];
    assert.ok(typeof text === "string" && text.trim().length > 0, `air-quality.label.${locale} must be non-empty`);
  }
  for (const key of ["earthquakes", "epidemics"]) {
    assert.ok(GLOBE_WATCH_ITEMS.some((item) => item.key === key), `the pre-existing ${key} entry must still be present, unremoved`);
  }
});

// ---------------------------------------------------------------------------
// translatedPages.ts wiring
// ---------------------------------------------------------------------------

test("/tools/global-watch/air-quality is a registered translated path with full en/ja/ko/x-default hreflang", async () => {
  const { isTranslatedPath, buildLocalizedPath, buildHreflangAlternates } = await import(
    "../lib/i18n/translatedPages.ts"
  );
  assert.ok(isTranslatedPath("/tools/global-watch/air-quality"));
  assert.equal(buildLocalizedPath("/tools/global-watch/air-quality", "en"), "/en/tools/global-watch/air-quality");
  assert.equal(buildLocalizedPath("/tools/global-watch/air-quality", "ja"), "/ja/tools/global-watch/air-quality");
  assert.equal(buildLocalizedPath("/tools/global-watch/air-quality", "ko"), "/ko/tools/global-watch/air-quality");

  const baseUrl = "https://health.j172.tw";
  const alternates = buildHreflangAlternates("/tools/global-watch/air-quality", baseUrl);
  assert.ok(alternates);
  assert.equal(alternates["zh-TW"], `${baseUrl}/tools/global-watch/air-quality`);
  assert.equal(alternates["en"], `${baseUrl}/en/tools/global-watch/air-quality`);
  assert.equal(alternates["x-default"], `${baseUrl}/tools/global-watch/air-quality`);
});

test("app/[locale]/tools/global-watch/air-quality/page.tsx exists on disk (required by tests/i18n-routing-485.test.mjs's generic TRANSLATED_STANDALONE_PATHS check)", () => {
  const pagePath = path.join(ROOT_DIR, "app", "[locale]", "tools", "global-watch", "air-quality", "page.tsx");
  assert.ok(fs.existsSync(pagePath));
});
