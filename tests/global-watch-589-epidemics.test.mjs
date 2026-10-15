import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #589 (parent #583): 國際疫情 (epidemics) item — country-grouping
// pure transform, the ISO/disease-name dictionaries' fallback-to-original
// behavior, the choropleth color-expression builder, and source-text/
// structural assertions for the pages and components, all following the
// same loader-hook convention tests/global-watch-587.test.mjs established.
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
  // lib/i18n/dictionary.ts (transitively imported by translatedPages.ts)
  // relies on TypeScript's resolveJsonModule to import the locale JSON
  // files with no `with { type: "json" }` attribute — same sidestep as
  // tests/i18n-routing-485.test.mjs.
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const ROOT_DIR = path.join(fileURLToPath(REPO_ROOT));

const {
  buildEpidemicsGlobeData,
  findCountryGroup,
  EPIDEMIC_LEVEL_LEGEND,
} = await import("../lib/tools/globeWatch/epidemicsTransform.ts");
const { EPIDEMIC_COUNTRY_NAMES, resolveCountryName } = await import(
  "../lib/tools/globeWatch/epidemicsCountryNames.ts"
);
const { EPIDEMIC_DISEASE_NAMES, resolveDiseaseName } = await import(
  "../lib/tools/globeWatch/epidemicsDiseaseNames.ts"
);
const {
  buildCountryFillColorExpression,
  EPIDEMIC_NEUTRAL_FILL_COLOR,
  EPIDEMIC_BOUNDARY_ISO_PROPERTY,
  EPIDEMIC_BOUNDARIES_URL,
} = await import("../lib/tools/globeWatch/epidemicsBoundaries.ts");

function makeRow(overrides) {
  return {
    id: "row-1",
    iso: null,
    country: "測試國",
    countryEn: "Testland",
    disease: "登革熱",
    levelCode: 1,
    severityLevel: "第一級:注意(Watch)",
    instruction: "提醒遵守當地的一般預防措施",
    web: "https://www.cdc.gov.tw",
    lat: null,
    lng: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildEpidemicsGlobeData — AC: 同一國家同時有第一級與第三級時取第三級；
// 沒有 ISO 時退回座標點
// ---------------------------------------------------------------------------

test("a country with both level 1 and level 3 diseases resolves to level 3 (highest wins)", () => {
  const rows = [
    makeRow({ id: "a", iso: "TH", levelCode: 1, disease: "屈公病" }),
    makeRow({ id: "b", iso: "TH", levelCode: 3, disease: "登革熱" }),
  ];
  const data = buildEpidemicsGlobeData(rows);
  const group = findCountryGroup(data, "TH");
  assert.ok(group, "expected a TH country group");
  assert.equal(group.levelCode, 3);
  assert.equal(group.diseases.length, 2);
});

test("a country's levelCode is the max across any number of rows, regardless of row order", () => {
  const rows = [
    makeRow({ id: "a", iso: "jp", levelCode: 2 }),
    makeRow({ id: "b", iso: "JP", levelCode: 1 }),
    makeRow({ id: "c", iso: "Jp", levelCode: 1 }),
  ];
  const data = buildEpidemicsGlobeData(rows);
  const group = findCountryGroup(data, "JP");
  assert.equal(group.levelCode, 2, "ISO matching must be case-insensitive");
  assert.equal(group.diseases.length, 3);
});

test("a row with no ISO falls back to a point feature instead of being dropped", () => {
  const rows = [makeRow({ id: "no-iso", iso: null, lat: 12.34, lng: 56.78, levelCode: 2 })];
  const data = buildEpidemicsGlobeData(rows);
  assert.equal(data.countries.length, 0);
  assert.equal(data.points.length, 1);
  assert.deepEqual(
    { lat: data.points[0].lat, lng: data.points[0].lng, levelCode: data.points[0].levelCode },
    { lat: 12.34, lng: 56.78, levelCode: 2 },
  );
});

test("a row with an empty-string or garbage ISO is also treated as 'no ISO' (falls back to point)", () => {
  for (const iso of ["", "   ", "N/A", "123", "ZZZZ"]) {
    const data = buildEpidemicsGlobeData([makeRow({ iso, lat: 1, lng: 2 })]);
    assert.equal(data.countries.length, 0, `iso=${JSON.stringify(iso)} should not produce a country group`);
    assert.equal(data.points.length, 1, `iso=${JSON.stringify(iso)} should still produce a point`);
  }
});

test("a row with no ISO and no coordinates is silently dropped from the globe data (nothing plottable) without throwing", () => {
  const data = buildEpidemicsGlobeData([makeRow({ iso: null, lat: null, lng: null })]);
  assert.equal(data.countries.length, 0);
  assert.equal(data.points.length, 0);
  assert.equal(data.emptyState, true);
});

test("a comma-joined multi-country ISO value splits into one country-group entry per code", () => {
  const rows = [makeRow({ id: "multi", iso: "DZ,TD,GN", levelCode: 2, disease: "新型A型流感" })];
  const data = buildEpidemicsGlobeData(rows);
  assert.equal(data.countries.length, 3);
  for (const iso of ["DZ", "TD", "GN"]) {
    const group = findCountryGroup(data, iso);
    assert.ok(group, `expected a ${iso} group`);
    assert.equal(group.levelCode, 2);
  }
});

test("rows with levelCode 0 (e.g. a lifted/解除 advisory) contribute nothing to the globe data", () => {
  const data = buildEpidemicsGlobeData([makeRow({ iso: "TH", levelCode: 0, lat: 1, lng: 2 })]);
  assert.equal(data.countries.length, 0);
  assert.equal(data.points.length, 0);
  assert.equal(data.emptyState, true);
});

test("emptyState is false whenever there is at least one country or point", () => {
  assert.equal(buildEpidemicsGlobeData([makeRow({ iso: "TH" })]).emptyState, false);
  assert.equal(buildEpidemicsGlobeData([makeRow({ iso: null, lat: 1, lng: 2 })]).emptyState, false);
  assert.equal(buildEpidemicsGlobeData([]).emptyState, true);
});

test("buildEpidemicsGlobeData always returns the shared EPIDEMIC_LEVEL_LEGEND with exactly 3 distinct level colors", () => {
  const data = buildEpidemicsGlobeData([]);
  assert.equal(data.legend, EPIDEMIC_LEVEL_LEGEND);
  assert.deepEqual(data.legend.map((l) => l.levelCode).sort(), [1, 2, 3]);
  const colors = new Set(data.legend.map((l) => l.color));
  assert.equal(colors.size, 3, "every level must have a distinct color");
});

// ---------------------------------------------------------------------------
// resolveCountryName / EPIDEMIC_COUNTRY_NAMES — AC: 查不到時顯示原文，不猜測
// 翻譯
// ---------------------------------------------------------------------------

test("resolveCountryName returns the dictionary's localized name for a known ISO", () => {
  assert.equal(resolveCountryName("TH", "zh-TW"), "泰國");
  assert.equal(resolveCountryName("TH", "en"), "Thailand");
  assert.equal(resolveCountryName("th", "ja"), "タイ", "lookup must be case-insensitive");
  assert.equal(resolveCountryName("TH", "ko"), "태국");
});

test("resolveCountryName falls back to the caller's original text for an unknown ISO, never a guess", () => {
  assert.equal(resolveCountryName("ZZ", "en", "Some Original Country Text"), "Some Original Country Text");
  assert.equal(resolveCountryName(null, "en", "Fallback"), "Fallback");
});

test("resolveCountryName falls back to the bare ISO code when there is no dictionary entry AND no fallback text", () => {
  assert.equal(resolveCountryName("ZZ", "en"), "ZZ");
  assert.equal(resolveCountryName(undefined, "en"), "");
});

test("EPIDEMIC_COUNTRY_NAMES covers every ISO code present in lib/server/cdc/baselineItems.ts", () => {
  const presentIsoCodes = extractDistinctIsoCodes();
  assert.ok(presentIsoCodes.size > 50, "sanity check: expected dozens of distinct ISO codes in the baseline");
  const missing = [...presentIsoCodes].filter((code) => !(code in EPIDEMIC_COUNTRY_NAMES));
  assert.deepEqual(missing, [], `EPIDEMIC_COUNTRY_NAMES is missing: ${missing.join(", ")}`);
});

test("every EPIDEMIC_COUNTRY_NAMES entry has non-empty zh/en/ja/ko", () => {
  for (const [iso, entry] of Object.entries(EPIDEMIC_COUNTRY_NAMES)) {
    for (const field of ["zh", "en", "ja", "ko"]) {
      assert.ok(typeof entry[field] === "string" && entry[field].trim().length > 0, `${iso}.${field} must be non-empty`);
    }
  }
});

// ---------------------------------------------------------------------------
// resolveDiseaseName / EPIDEMIC_DISEASE_NAMES — AC: 查不到的病名顯示原文而非
// 猜測翻譯
// ---------------------------------------------------------------------------

test("resolveDiseaseName returns the dictionary's localized name for a known disease", () => {
  assert.equal(resolveDiseaseName("登革熱", "en"), "Dengue fever");
  assert.equal(resolveDiseaseName("登革熱", "ja"), "デング熱");
  assert.equal(resolveDiseaseName("登革熱", "ko"), "뎅기열");
});

test("resolveDiseaseName always returns the original zh text for zh-TW, even for a dictionary-listed disease", () => {
  assert.equal(resolveDiseaseName("登革熱", "zh-TW"), "登革熱");
});

test("resolveDiseaseName falls back to the original text verbatim for an unresolved disease name, never a guessed translation", () => {
  const unknown = "未知病名12345";
  assert.equal(resolveDiseaseName(unknown, "en"), unknown);
  assert.equal(resolveDiseaseName(unknown, "ja"), unknown);
  assert.equal(resolveDiseaseName(unknown, "ko"), unknown);
});

test("EPIDEMIC_DISEASE_NAMES covers every disease name present in lib/server/cdc/baselineItems.ts", () => {
  const presentDiseases = extractDistinctDiseases();
  assert.ok(presentDiseases.size > 10, "sanity check: expected a couple dozen distinct diseases in the baseline");
  const missing = [...presentDiseases].filter((d) => !(d in EPIDEMIC_DISEASE_NAMES));
  assert.deepEqual(missing, [], `EPIDEMIC_DISEASE_NAMES is missing: ${missing.join(", ")}`);
});

test("every EPIDEMIC_DISEASE_NAMES entry has non-empty en/ja/ko", () => {
  for (const [disease, entry] of Object.entries(EPIDEMIC_DISEASE_NAMES)) {
    for (const field of ["en", "ja", "ko"]) {
      assert.ok(typeof entry[field] === "string" && entry[field].trim().length > 0, `${disease}.${field} must be non-empty`);
    }
  }
});

// ---------------------------------------------------------------------------
// buildCountryFillColorExpression — the choropleth color-expression builder
// ---------------------------------------------------------------------------

test("buildCountryFillColorExpression returns the plain neutral color (not a match expression) when there are no alerted countries", () => {
  assert.equal(buildCountryFillColorExpression([], EPIDEMIC_LEVEL_LEGEND), EPIDEMIC_NEUTRAL_FILL_COLOR);
});

test("buildCountryFillColorExpression returns a MapLibre match expression keyed by the boundary ISO property, one pair per country, ending in the neutral fallback", () => {
  const countries = [
    { iso: "TH", levelCode: 1, diseases: [] },
    { iso: "JP", levelCode: 3, diseases: [] },
  ];
  const expr = buildCountryFillColorExpression(countries, EPIDEMIC_LEVEL_LEGEND);
  assert.deepEqual(expr[0], "match");
  assert.deepEqual(expr[1], ["get", EPIDEMIC_BOUNDARY_ISO_PROPERTY]);
  assert.equal(expr.at(-1), EPIDEMIC_NEUTRAL_FILL_COLOR);
  // "TH" -> level 1 color, "JP" -> level 3 color
  const thIndex = expr.indexOf("TH");
  const jpIndex = expr.indexOf("JP");
  assert.equal(expr[thIndex + 1], EPIDEMIC_LEVEL_LEGEND.find((l) => l.levelCode === 1).color);
  assert.equal(expr[jpIndex + 1], EPIDEMIC_LEVEL_LEGEND.find((l) => l.levelCode === 3).color);
});

// ---------------------------------------------------------------------------
// Boundary GeoJSON asset — AC: Natural Earth 1:110m 台灣觀點版，台灣為獨立區塊
// ---------------------------------------------------------------------------

test("the Natural Earth boundary file referenced by EPIDEMIC_BOUNDARIES_URL exists under public/ and plots Taiwan as its own feature, independent of China", () => {
  const publicPath = path.join(ROOT_DIR, "public", EPIDEMIC_BOUNDARIES_URL.replace(/^\//, ""));
  assert.ok(fs.existsSync(publicPath), `expected ${publicPath} to exist`);
  const geojson = JSON.parse(fs.readFileSync(publicPath, "utf-8"));
  assert.equal(geojson.type, "FeatureCollection");
  assert.ok(geojson.features.length > 100, "expected the full ~177-country Natural Earth 1:110m set");

  const twn = geojson.features.find((f) => f.properties[EPIDEMIC_BOUNDARY_ISO_PROPERTY] === "TW");
  const chn = geojson.features.find((f) => f.properties[EPIDEMIC_BOUNDARY_ISO_PROPERTY] === "CN");
  assert.ok(twn, "expected a Taiwan feature");
  assert.ok(chn, "expected a China feature");
  assert.notEqual(twn, chn, "Taiwan must be its own feature, not merged into China's");
  assert.notDeepEqual(twn.geometry, chn.geometry);
});

// ---------------------------------------------------------------------------
// Pages / components — source-text + structural assertions, same convention
// as tests/global-watch-587.test.mjs
// ---------------------------------------------------------------------------

const zhPageSrc = fs.readFileSync(
  path.join(ROOT_DIR, "app", "(zh)", "tools", "global-watch", "epidemics", "page.tsx"),
  "utf-8",
);
const localePageSrc = fs.readFileSync(
  path.join(ROOT_DIR, "app", "[locale]", "tools", "global-watch", "epidemics", "page.tsx"),
  "utf-8",
);
const rootZhPageSrc = fs.readFileSync(
  path.join(ROOT_DIR, "app", "(zh)", "tools", "global-watch", "page.tsx"),
  "utf-8",
);
const clientSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchEpidemicsClient.tsx"),
  "utf-8",
);
const globeSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchEpidemicsGlobe.tsx"),
  "utf-8",
);
const itemsRegistrySrc = fs.readFileSync(
  path.join(ROOT_DIR, "lib", "tools", "globeWatch", "items.ts"),
  "utf-8",
);

test("the zh epidemics page has its own metadata (title/description/keywords/canonical), distinct from the root global-watch shell page", () => {
  assert.match(zhPageSrc, /canonical = `\$\{getBaseUrl\(\)\}\/tools\/global-watch\/epidemics`/);
  assert.match(zhPageSrc, /export const metadata: Metadata = \{/);
  assert.match(zhPageSrc, /title:\s*"國際疫情/);
  assert.match(zhPageSrc, /keywords:\s*\[[^\]]*"登革熱"/, "must carry over the issue #462 登革熱 keyword");
  assert.doesNotMatch(zhPageSrc, /title:\s*catalogEntry\.title,\s*$/m);
});

test("the zh epidemics page carries over TravelEpidemicAlertsContent (disease search/pagination/news feed) unchanged", () => {
  assert.match(zhPageSrc, /import TravelEpidemicAlertsContent from "@\/components\/Epidemic\/TravelEpidemicAlertsContent"/);
  assert.match(zhPageSrc, /<TravelEpidemicAlertsContent\s*\/>/);
});

test("the zh epidemics page renders the shared item-switcher tab bar and the epidemics globe client", () => {
  // Issue #588 merged into main with its own GLOBE_WATCH_ITEMS registry
  // (lib/tools/globeWatch/items.ts) + GlobeWatchItemTabs.tsx switcher while
  // this PR was in flight — reconciled by deleting this PR's independent
  // GlobeWatchItemNav.tsx and using #588's component instead (items.ts
  // upgraded with per-locale labels, epidemics added to its array; see that
  // file's doc comment).
  assert.match(zhPageSrc, /<GlobeWatchItemTabs\s*\/>/);
  assert.match(zhPageSrc, /<GlobeWatchEpidemicsClient\s*\/>/);
});

test("the root global-watch shell page (issue #587) now also renders the shared item-switcher tab bar", () => {
  assert.match(rootZhPageSrc, /<GlobeWatchItemTabs\s*\/>/);
});

test("the locale epidemics page follows the earthquakes locale-page pattern: generateStaticParams over PATH_LOCALES, notFound() guard, and hreflang alternates", () => {
  assert.match(localePageSrc, /export function generateStaticParams\(\)/);
  assert.match(localePageSrc, /PATH_LOCALES\.map/);
  assert.match(localePageSrc, /if \(!isPathLocale\(locale\)\) notFound\(\);/);
  assert.match(localePageSrc, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(localePageSrc, /CANONICAL_PATH = "\/tools\/global-watch\/epidemics"/);
});

test("the locale epidemics page has complete en/ja/ko title+description (never falling back to Chinese)", () => {
  for (const locale of ["en", "ja", "ko"]) {
    assert.match(localePageSrc, new RegExp(`${locale}:\\s*\\{`));
  }
  assert.doesNotMatch(localePageSrc, /title:\s*""/);
});

test("GlobeWatchEpidemicsClient loads the globe via next/dynamic with ssr:false, gated behind the WebGL probe", () => {
  assert.match(clientSrc, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/GlobeWatchEpidemicsGlobe"\)/);
  assert.match(clientSrc, /ssr:\s*false/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&/);
  assert.match(clientSrc, /webglSupported\s*===\s*false\s*&&/);
});

test("GlobeWatchEpidemicsClient calls buildEpidemicsGlobeData on the fetched rows rather than hand-rolling the grouping logic inline", () => {
  assert.match(clientSrc, /buildEpidemicsGlobeData\(rows\)/);
  assert.match(clientSrc, /fetch\("\/api\/cdc\/travel-alerts"\)/, "must reuse the existing API route, not a new one");
});

test("GlobeWatchEpidemicsGlobe fetches the boundary GeoJSON lazily via fetch(), never a static import (AC: 國界檔只在這個項目載入)", () => {
  assert.match(globeSrc, /fetch\(EPIDEMIC_BOUNDARIES_URL\)/);
  assert.doesNotMatch(globeSrc, /import\s+.*\.geojson/);
});

test("GlobeWatchEpidemicsGlobe uses MapLibre's globe projection and wires a click handler on the country fill layer", () => {
  assert.match(globeSrc, /setProjection\(\{\s*type:\s*"globe"\s*\}\)/);
  assert.match(globeSrc, /map\.on\("click",\s*COUNTRY_FILL_LAYER_ID/);
  assert.match(globeSrc, /onSelectCountryRef\.current\(iso\)/);
});

test("the epidemics item is registered in the shared GLOBE_WATCH_ITEMS registry (lib/tools/globeWatch/items.ts) with a full per-locale label, alongside #588's earthquakes entry", async () => {
  assert.match(itemsRegistrySrc, /key:\s*"epidemics"/);
  assert.match(itemsRegistrySrc, /path:\s*"\/tools\/global-watch\/epidemics"/);

  const { GLOBE_WATCH_ITEMS } = await import("../lib/tools/globeWatch/items.ts");
  const epidemics = GLOBE_WATCH_ITEMS.find((item) => item.key === "epidemics");
  assert.ok(epidemics, "expected an epidemics entry in GLOBE_WATCH_ITEMS");
  assert.equal(epidemics.path, "/tools/global-watch/epidemics");
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    const text = epidemics.label?.[locale];
    assert.ok(typeof text === "string" && text.trim().length > 0, `epidemics.label.${locale} must be non-empty`);
  }
  assert.ok(
    GLOBE_WATCH_ITEMS.some((item) => item.key === "earthquakes"),
    "the pre-existing #588 earthquakes entry must still be present, unremoved",
  );
});

// ---------------------------------------------------------------------------
// translatedPages.ts wiring
// ---------------------------------------------------------------------------

test("/tools/global-watch/epidemics is a registered translated path with full en/ja/ko/x-default hreflang", async () => {
  const { isTranslatedPath, buildLocalizedPath, buildHreflangAlternates } = await import(
    "../lib/i18n/translatedPages.ts"
  );
  assert.ok(isTranslatedPath("/tools/global-watch/epidemics"));
  assert.equal(buildLocalizedPath("/tools/global-watch/epidemics", "en"), "/en/tools/global-watch/epidemics");
  assert.equal(buildLocalizedPath("/tools/global-watch/epidemics", "ja"), "/ja/tools/global-watch/epidemics");
  assert.equal(buildLocalizedPath("/tools/global-watch/epidemics", "ko"), "/ko/tools/global-watch/epidemics");

  const baseUrl = "https://health.j172.tw";
  const alternates = buildHreflangAlternates("/tools/global-watch/epidemics", baseUrl);
  assert.ok(alternates);
  assert.equal(alternates["zh-TW"], `${baseUrl}/tools/global-watch/epidemics`);
  assert.equal(alternates["en"], `${baseUrl}/en/tools/global-watch/epidemics`);
  assert.equal(alternates["x-default"], `${baseUrl}/tools/global-watch/epidemics`);
});

// ---------------------------------------------------------------------------
// Helpers: extract the distinct ISO codes / disease names actually present
// in the committed CDC baseline (the real-data proxy for "cdc_travel_alerts
// 目前出現過的所有 ISO 與疾病名" — see lib/server/cdc/baselineItems.ts, the
// same file that auto-seeds cdc_travel_alerts/cdc_epidemic_news when those
// tables are empty).
// ---------------------------------------------------------------------------

function readBaselineArrays() {
  const src = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "cdc", "baselineItems.ts"), "utf-8");
  const lines = src.split("\n");
  const arrays = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^export const \w+ = \[/.test(lines[i])) {
      const start = i;
      let end = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "];") {
          end = j;
          break;
        }
      }
      if (end === -1) throw new Error(`readBaselineArrays: no closing "];" found for array starting at line ${i}`);
      const text = lines.slice(start, end + 1).join("\n");
      const bracketStart = text.indexOf("[");
      const bracketEnd = text.lastIndexOf("]");
      arrays.push(JSON.parse(text.slice(bracketStart, bracketEnd + 1)));
      i = end;
    }
  }
  return arrays.flat();
}

function extractDistinctIsoCodes() {
  const rows = readBaselineArrays();
  const codes = new Set();
  for (const row of rows) {
    const raw = row.ISO3166;
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const code = part.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) codes.add(code);
    }
  }
  return codes;
}

function extractDistinctDiseases() {
  const rows = readBaselineArrays();
  const diseases = new Set();
  for (const row of rows) {
    const d = row.alert_disease || row.disease;
    if (d) diseases.add(d);
  }
  return diseases;
}
