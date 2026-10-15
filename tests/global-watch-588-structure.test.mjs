import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #588 (parent #583): source-text / registry-level checks for the
// earthquake item's page shell, routing, and globe wiring — the parts this
// repo's `node --test` runner can't exercise as rendered JSX (no DOM/JSX
// harness exists here), following the same convention
// tests/global-watch-587.test.mjs and tests/tools-cpc-stations-redirect.test.mjs
// already use for this kind of check.
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

// ---------------------------------------------------------------------------
// AC: "/tools/global-watch/earthquakes 與其 en/ja/ko 版本回應 200，各自有
// 獨立 title/description/keywords/canonical/hreflang"
// ---------------------------------------------------------------------------

const zhPageSrc = readSrc("app", "(zh)", "tools", "global-watch", "earthquakes", "page.tsx");
const localePageSrc = readSrc("app", "[locale]", "tools", "global-watch", "earthquakes", "page.tsx");

test("the zh earthquakes item page declares its own title/description/keywords/canonical/hreflang", () => {
  assert.match(zhPageSrc, /title:\s*TITLE/);
  assert.match(zhPageSrc, /description:\s*DESCRIPTION/);
  assert.match(zhPageSrc, /keywords:\s*\[[^\]]*"地震"/);
  assert.match(zhPageSrc, /canonical,\s*languages:\s*buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(zhPageSrc, /CANONICAL_PATH\s*=\s*"\/tools\/global-watch\/earthquakes"/);
});

test("the locale earthquakes item page builds metadata from getLocalizedPageMeta('globalWatchEarthquakes', ...) with reciprocal hreflang", () => {
  assert.match(localePageSrc, /getLocalizedPageMeta\("globalWatchEarthquakes", locale\)/);
  assert.match(localePageSrc, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(localePageSrc, /generateStaticParams/);
  assert.match(localePageSrc, /PATH_LOCALES\.map/);
});

test("getLocalizedPageMeta('globalWatchEarthquakes', locale) returns complete, non-empty, genuinely-translated en/ja/ko content", async () => {
  const { getLocalizedPageMeta } = await import("../lib/i18n/pageContent.ts");
  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedPageMeta("globalWatchEarthquakes", locale);
    assert.ok(meta.title?.trim(), `${locale}: title must not be empty`);
    assert.ok(meta.description?.trim(), `${locale}: description must not be empty`);
  }
  // Only "en" is checked for leftover untranslated Chinese — ja/ko
  // legitimately use CJK kanji/hanja characters that fall in the same
  // Unicode range (same convention as the issue #486 batch's own
  // "en content ... contains no untranslated Chinese characters" test,
  // which likewise only ever checks the en locale).
  const enMeta = getLocalizedPageMeta("globalWatchEarthquakes", "en");
  assert.ok(!/[一-鿿]/.test(enMeta.title), "en: title should not contain untranslated Chinese");
  assert.ok(!/[一-鿿]/.test(enMeta.description), "en: description should not contain untranslated Chinese");
});

test("both earthquakes item pages fetch getTieredEarthquakes(168, 100) — the unchanged '顯著地震' list rule — and getGlobeWatchEarthquakeCandidates for the globe", () => {
  for (const src of [zhPageSrc, localePageSrc]) {
    assert.match(src, /getTieredEarthquakes\(168, 100\)/);
    assert.match(src, /getGlobeWatchEarthquakeCandidates\(\)/);
  }
});

// ---------------------------------------------------------------------------
// Routing registry: lib/i18n/translatedPages.ts
// ---------------------------------------------------------------------------

test("translatedPages.ts registers /tools/global-watch/earthquakes as a translated standalone path, in scope, with reciprocal hreflang", async () => {
  const {
    TRANSLATED_STANDALONE_PATHS,
    I18N_SCOPE_PAGES,
    TRANSLATED_CANONICAL_PATHS,
    isTranslatedPath,
    buildHreflangAlternates,
    scopeEntryPath,
  } = await import("../lib/i18n/translatedPages.ts");

  const path_ = "/tools/global-watch/earthquakes";
  assert.ok(TRANSLATED_STANDALONE_PATHS.map(scopeEntryPath).includes(path_));
  assert.ok(I18N_SCOPE_PAGES.map(scopeEntryPath).includes(path_));
  assert.ok(TRANSLATED_CANONICAL_PATHS.includes(path_));
  assert.ok(isTranslatedPath(path_));

  const alternates = buildHreflangAlternates(path_, "https://health.j172.tw");
  assert.ok(alternates);
  assert.equal(alternates["zh-TW"], "https://health.j172.tw/tools/global-watch/earthquakes");
  assert.equal(alternates.en, "https://health.j172.tw/en/tools/global-watch/earthquakes");
  assert.equal(alternates.ja, "https://health.j172.tw/ja/tools/global-watch/earthquakes");
  assert.equal(alternates.ko, "https://health.j172.tw/ko/tools/global-watch/earthquakes");
  assert.equal(alternates["x-default"], "https://health.j172.tw/tools/global-watch/earthquakes");
});

test("'global-watch' is NOT a TRANSLATED_TOOL_SLUGS entry — the base /tools/global-watch page stays zh-only; only the item sub-route is translated", async () => {
  const { TRANSLATED_TOOL_SLUGS } = await import("../lib/i18n/translatedPages.ts");
  assert.ok(!TRANSLATED_TOOL_SLUGS.includes("global-watch"));
});

// ---------------------------------------------------------------------------
// AC: globe markers — wiring (business rule itself is tested in
// tests/global-watch-588-earthquakes.test.mjs against the pure module)
// ---------------------------------------------------------------------------

const globeSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchGlobe.tsx");
const clientSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchClient.tsx");
const itemSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchEarthquakesItem.tsx");

test("GlobeWatchGlobe accepts an optional earthquakes layer prop and never requires it (bare #587 shell keeps working)", () => {
  assert.match(globeSrc, /earthquakes\?:\s*EarthquakeGlobeLayerProps/);
});

test("GlobeWatchGlobe creates a GeoJSON source + two circle layers for earthquake markers, and keeps the data layer separate from the tsunami ring layer", () => {
  assert.match(globeSrc, /EARTHQUAKE_SOURCE_ID\s*=\s*"globe-watch-earthquakes"/);
  assert.match(globeSrc, /EARTHQUAKE_CIRCLE_LAYER_ID\s*=\s*"globe-watch-earthquakes-circle"/);
  assert.match(globeSrc, /EARTHQUAKE_TSUNAMI_LAYER_ID\s*=\s*"globe-watch-earthquakes-tsunami-ring"/);
  assert.match(globeSrc, /filter:\s*\["==",\s*\["get",\s*"isTsunami"\],\s*true\]/);
});

test("GlobeWatchGlobe's circle layer paints radius/color straight from the feature properties the pure transform module computed (AC: 標記大小/顏色依規模分級)", () => {
  assert.match(globeSrc, /"circle-radius":\s*\["get",\s*"markerRadiusPx"\]/);
  assert.match(globeSrc, /"circle-color":\s*\["get",\s*"markerColor"\]/);
});

test("GlobeWatchGlobe binds a click handler on the earthquake circle layer that opens a MapLibre Popup built from EarthquakeGlobeFeatureProperties", () => {
  assert.match(globeSrc, /map\.on\("click",\s*EARTHQUAKE_CIRCLE_LAYER_ID/);
  assert.match(globeSrc, /new Popup\(/);
  assert.match(globeSrc, /buildEarthquakePopupHtml\(/);
});

test("GlobeWatchGlobe's flyTo effect reuses resolveCameraTransition/resolveFlyDurationMs (not a second hand-rolled flyTo path) and keys off flyToToken", () => {
  assert.match(globeSrc, /\[earthquakes\?\.flyTo\?\.flyToToken\]/);
  assert.match(globeSrc, /resolveCameraTransition\(reducedMotion\) === "jump"/);
  assert.match(globeSrc, /resolveFlyDurationMs\(reducedMotion, EARTHQUAKE_FLY_DURATION_MS\)/);
});

test("ensureSatelliteLayer stacks the satellite raster BELOW the earthquake layers when they already exist, so satellite never occludes markers", () => {
  assert.match(globeSrc, /EARTHQUAKE_TSUNAMI_LAYER_ID\)\s*\?\s*EARTHQUAKE_TSUNAMI_LAYER_ID\s*:\s*firstSymbolLayerId/);
});

test("GlobeWatchClient forwards an optional earthquakes prop straight to GlobeWatchGlobe", () => {
  assert.match(clientSrc, /earthquakes\?:\s*EarthquakeGlobeLayerProps/);
  assert.match(clientSrc, /<GlobeWatchGlobe locale=\{locale\} reducedMotion=\{reducedMotion\} earthquakes=\{earthquakes\}\s*\/>/);
});

// ---------------------------------------------------------------------------
// AC: shared M4/M6/M7 filter + list-click-flies-globe + item tabs
// ---------------------------------------------------------------------------

test("GlobeWatchEarthquakesItem lifts one filterMinMag state value and passes it to both the globe feature collection and EarthquakeContent", () => {
  assert.match(itemSrc, /buildEarthquakeGlobeFeatureCollection\(globeRows, \{ minMagnitude: filterMinMag \}\)/);
  assert.match(itemSrc, /filterMinMag=\{filterMinMag\}/);
  assert.match(itemSrc, /onFilterChange=\{setFilterMinMag\}/);
});

test("GlobeWatchEarthquakesItem wires EarthquakeContent's onSelect to set a flyTo target looked up from globeRows by id", () => {
  assert.match(itemSrc, /onSelect=\{handleSelectListItem\}/);
  assert.match(itemSrc, /globeRows\.find\(\(row\) => row\.id === item\.id\)/);
  assert.match(itemSrc, /setFlyTo\(\{ lng: match\.lng, lat: match\.lat, flyToToken: flyTokenRef\.current \}\)/);
});

test("GlobeWatchEarthquakesItem renders the GlobeWatchItemTabs switcher", () => {
  assert.match(itemSrc, /<GlobeWatchItemTabs\s*\/>/);
});

const tabsSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchItemTabs.tsx");
test("GlobeWatchItemTabs renders from the GLOBE_WATCH_ITEMS registry and builds locale-aware hrefs", () => {
  assert.match(tabsSrc, /import \{ GLOBE_WATCH_ITEMS \} from "@\/lib\/tools\/globeWatch\/items"/);
  assert.match(tabsSrc, /GLOBE_WATCH_ITEMS\.map/);
  assert.match(tabsSrc, /buildLocalizedPath\(item\.path, locale\)/);
});

test("GLOBE_WATCH_ITEMS keeps hosting the earthquake item (now with a locale-aware label) as later items join the array", async () => {
  // Issue #589 grew this from a 1-item array to 2 (earthquakes + 國際疫情),
  // replacing the original exact-length(1) snapshot with a containment
  // check on the earthquakes entry specifically — the same "at least"
  // pattern this suite's other registries (TRANSLATED_TOOL_SLUGS etc.) use
  // once a second item makes an exact-length assertion brittle.
  const { GLOBE_WATCH_ITEMS } = await import("../lib/tools/globeWatch/items.ts");
  assert.ok(GLOBE_WATCH_ITEMS.length >= 2, "expected at least earthquakes + epidemics");

  const earthquakes = GLOBE_WATCH_ITEMS.find((item) => item.key === "earthquakes");
  assert.ok(earthquakes, "earthquakes entry must still exist");
  assert.equal(earthquakes.path, "/tools/global-watch/earthquakes");
  // Issue #589: GlobeWatchItemDef grew a `label` map (per-locale) alongside
  // the original `labelDefault` — every item, including this pre-existing
  // one, must have real (non-empty, non-placeholder) text for all 4 locales.
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    const text = earthquakes.label?.[locale];
    assert.ok(typeof text === "string" && text.trim().length > 0, `earthquakes.label.${locale} must be non-empty`);
  }
  assert.equal(earthquakes.label["zh-TW"], earthquakes.labelDefault, "labelDefault must still match the zh-TW label");
});

// ---------------------------------------------------------------------------
// AC: EarthquakeContent's controlled-filter/onSelect props stay optional,
// defaulting to its original uncontrolled behavior.
//
// Issue #590 (parent #583) retired the standalone "/tools/earthquakes" page
// this component used to also be rendered by unchanged (zero-blast-radius
// backward compatibility) — that page and its own copy of this component
// are gone now (301s to the global-watch item below instead; see
// tests/tools-global-watch-earthquakes-redirect-590.test.mjs), and the
// component itself moved to components/Tools/GlobeWatch/EarthquakeContent.tsx
// as this item's one remaining caller. The optional-props contract itself is
// still real and still worth guarding (a future caller could still rely on
// the uncontrolled default), so that assertion survives; the
// now-impossible "old page still renders it unchanged" assertion does not.
// ---------------------------------------------------------------------------

const earthquakeContentSrc = readSrc("components", "Tools", "GlobeWatch", "EarthquakeContent.tsx");

test("EarthquakeContent's controlled-filter/onSelect props are all optional, defaulting to its original uncontrolled behavior", () => {
  assert.match(earthquakeContentSrc, /filterMinMag\?:\s*number/);
  assert.match(earthquakeContentSrc, /onFilterChange\?:\s*\(value: number\) => void/);
  assert.match(earthquakeContentSrc, /onSelect\?:\s*\(item: SignificantEarthquake\) => void/);
  assert.match(earthquakeContentSrc, /filterMinMag\s*=\s*controlledFilterMinMag\s*\?\?\s*internalFilterMinMag/);
});

// ---------------------------------------------------------------------------
// AC: "不支援 WebGL 時，清單維持完整可用" — the list lives outside
// GlobeWatchClient entirely, so WebGL support never gates it.
// ---------------------------------------------------------------------------

test("GlobeWatchEarthquakesItem renders EarthquakeContent as a sibling of GlobeWatchClient, not nested inside it or conditioned on WebGL support", () => {
  const globeClientIndex = itemSrc.indexOf("<GlobeWatchClient");
  const earthquakeContentIndex = itemSrc.indexOf("<EarthquakeContent");
  assert.ok(globeClientIndex >= 0 && earthquakeContentIndex >= 0);
  assert.ok(earthquakeContentIndex > globeClientIndex);
  // GlobeWatchClient's own closing tag must appear before EarthquakeContent
  // opens — i.e. they're siblings, EarthquakeContent isn't nested as a child.
  const globeClientSelfClosed = itemSrc.slice(globeClientIndex, earthquakeContentIndex).includes("/>");
  assert.ok(globeClientSelfClosed, "GlobeWatchClient should be self-closed before EarthquakeContent renders, i.e. siblings");
});
