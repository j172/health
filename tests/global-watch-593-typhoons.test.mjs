import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #593 (parent #583): 颱風 (typhoons) item — the ocean-basin merge/
// dedup pure transform, the CWA position-text parser, and source-text/
// structural assertions for the pages and components, following the same
// loader-hook convention tests/global-watch-587.test.mjs established and
// tests/global-watch-588-*.test.mjs / tests/global-watch-589-epidemics.test.mjs
// already follow.
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
  buildTyphoonsGlobeData,
  parseCwaTyphoonPosition,
  TYPHOON_LEGEND,
  GDACS_ALERT_COLORS,
  CWA_TYPHOON_MARKER_COLOR,
} = await import("../lib/tools/globeWatch/typhoonsTransform.ts");

function makeCwaRow(overrides) {
  return {
    alertKey: "cwa-1",
    event: "強烈颱風 山竹 (Mangkhut) 第22號",
    headline: "近中心最大風速 55 m/s",
    description: "北緯 23.5° / 東經 121.2° ｜近中心最大風速 55 m/s",
    areaDesc: "北緯 23.5° / 東經 121.2°",
    effective: "2026-10-14T00:00:00Z",
    expires: "2026-10-16T00:00:00Z",
    web: "https://www.cwa.gov.tw/V8/C/P/Typhoon/Typhoon.html",
    ...overrides,
  };
}

function makeGdacsRow(overrides) {
  return {
    eventId: "1000123",
    episodeId: "1",
    alertLevel: "Orange",
    countryIso: "PHL",
    lat: 14.5,
    lng: 121.0,
    startTime: "2026-10-14T00:00:00Z",
    endTime: null,
    title: "Tropical Cyclone MILTON-26",
    reportUrl: "https://www.gdacs.org/report.aspx?eventid=1000123",
    basin: "WP",
    trackGeoJson: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseCwaTyphoonPosition
// ---------------------------------------------------------------------------

test("parseCwaTyphoonPosition parses CWA's '北緯 .. / 東經 ..' text format", () => {
  assert.deepEqual(parseCwaTyphoonPosition("北緯 23.5° / 東經 121.2°"), { lat: 23.5, lng: 121.2 });
});

test("parseCwaTyphoonPosition returns null for missing/unparseable input", () => {
  assert.equal(parseCwaTyphoonPosition(null), null);
  assert.equal(parseCwaTyphoonPosition(""), null);
  assert.equal(parseCwaTyphoonPosition("some unrelated text"), null);
  assert.equal(parseCwaTyphoonPosition("北緯 23.5°"), null, "missing longitude half");
});

// ---------------------------------------------------------------------------
// buildTyphoonsGlobeData — AC: 西太平洋同時有 CWA 與 GDACS 資料時只輸出 CWA；
// 大西洋只輸出 GDACS
// ---------------------------------------------------------------------------

test("when both CWA and a GDACS WP-basin row exist, only the CWA row is output (no duplicate)", () => {
  const cwaRows = [makeCwaRow({ alertKey: "cwa-wp" })];
  const gdacsRows = [makeGdacsRow({ eventId: "gdacs-wp", basin: "WP" })];

  const data = buildTyphoonsGlobeData(cwaRows, gdacsRows);

  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].id, "cwa-wp");
  assert.equal(data.listItems[0].source, "cwa");
  assert.equal(data.points.features.length, 1);
  assert.equal(data.points.features[0].properties.source, "cwa");
});

test("a GDACS row in a non-WP basin (e.g. North Atlantic) is output on its own, with no CWA counterpart needed", () => {
  const data = buildTyphoonsGlobeData([], [makeGdacsRow({ eventId: "gdacs-na", basin: "NA", title: "Hurricane TEST" })]);

  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].id, "gdacs-na");
  assert.equal(data.listItems[0].source, "gdacs");
  assert.equal(data.listItems[0].basin, "NA");
  assert.equal(data.emptyState, false);
});

test("CWA rows and non-WP GDACS rows coexist in the same output without interfering with each other", () => {
  const cwaRows = [makeCwaRow({ alertKey: "cwa-wp" })];
  const gdacsRows = [
    makeGdacsRow({ eventId: "gdacs-wp-dup", basin: "WP" }), // dropped
    makeGdacsRow({ eventId: "gdacs-na", basin: "NA" }), // kept
  ];

  const data = buildTyphoonsGlobeData(cwaRows, gdacsRows);
  const ids = data.listItems.map((i) => i.id).sort();
  assert.deepEqual(ids, ["cwa-wp", "gdacs-na"].sort());
});

test("a GDACS row with a null basin (undetermined) is still shown, not treated as WP", () => {
  const data = buildTyphoonsGlobeData([], [makeGdacsRow({ eventId: "gdacs-null-basin", basin: null })]);
  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].basin, null);
});

// ---------------------------------------------------------------------------
// emptyState — AC: 沒有任何活動颱風時顯示空狀態
// ---------------------------------------------------------------------------

test("emptyState is true when there are no CWA rows and no non-WP GDACS rows", () => {
  assert.equal(buildTyphoonsGlobeData([], []).emptyState, true);
  // A GDACS row that's dropped by the WP filter still counts as "nothing active".
  assert.equal(buildTyphoonsGlobeData([], [makeGdacsRow({ basin: "WP" })]).emptyState, true);
});

test("emptyState is false whenever at least one row survives the basin filter", () => {
  assert.equal(buildTyphoonsGlobeData([makeCwaRow()], []).emptyState, false);
  assert.equal(buildTyphoonsGlobeData([], [makeGdacsRow({ basin: "SP" })]).emptyState, false);
});

test("buildTyphoonsGlobeData never throws on empty input and returns well-formed empty collections", () => {
  const data = buildTyphoonsGlobeData([], []);
  assert.deepEqual(data.points, { type: "FeatureCollection", features: [] });
  assert.deepEqual(data.tracks, { type: "FeatureCollection", features: [] });
  assert.deepEqual(data.listItems, []);
});

// ---------------------------------------------------------------------------
// AC: 西太平洋颱風顯示中文名稱、目前位置、路徑潛勢
// ---------------------------------------------------------------------------

test("a CWA row's Chinese name (event string), parsed position, and official track link all survive into the list item", () => {
  const data = buildTyphoonsGlobeData([makeCwaRow()], []);
  const item = data.listItems[0];
  assert.equal(item.name, "強烈颱風 山竹 (Mangkhut) 第22號");
  assert.equal(item.lat, 23.5);
  assert.equal(item.lng, 121.2);
  assert.equal(item.web, "https://www.cwa.gov.tw/V8/C/P/Typhoon/Typhoon.html");
});

test("a CWA row with no parseable position still appears in listItems but contributes no point feature", () => {
  const data = buildTyphoonsGlobeData([makeCwaRow({ areaDesc: null })], []);
  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].lat, null);
  assert.equal(data.points.features.length, 0, "no coordinates means no globe marker, but the row isn't dropped");
});

// ---------------------------------------------------------------------------
// GDACS track GeoJSON passthrough (AC: 路徑潛勢 for non-WP storms)
// ---------------------------------------------------------------------------

test("a GDACS row's trackGeoJson features are merged into `tracks`, tagged with stormEventId", () => {
  const trackGeoJson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "LineString", coordinates: [[120, 10], [121, 11]] }, properties: {} },
      { type: "Feature", geometry: { type: "Point", coordinates: [121, 11] }, properties: {} },
    ],
  };
  const data = buildTyphoonsGlobeData([], [makeGdacsRow({ eventId: "gdacs-track", basin: "NA", trackGeoJson })]);
  assert.equal(data.tracks.features.length, 2);
  for (const feature of data.tracks.features) {
    assert.equal(feature.properties.stormEventId, "gdacs-track");
  }
  assert.equal(data.listItems[0].hasTrack, true);
});

test("a GDACS row with no trackGeoJson sets hasTrack: false and contributes nothing to `tracks`", () => {
  const data = buildTyphoonsGlobeData([], [makeGdacsRow({ basin: "NA", trackGeoJson: null })]);
  assert.equal(data.listItems[0].hasTrack, false);
  assert.equal(data.tracks.features.length, 0);
});

// ---------------------------------------------------------------------------
// Marker colors / legend
// ---------------------------------------------------------------------------

test("CWA points use the fixed CWA marker color; GDACS points use the GDACS alert-level color", () => {
  const data = buildTyphoonsGlobeData(
    [makeCwaRow()],
    [makeGdacsRow({ basin: "NA", alertLevel: "Red" })],
  );
  const cwaPoint = data.points.features.find((f) => f.properties.source === "cwa");
  const gdacsPoint = data.points.features.find((f) => f.properties.source === "gdacs");
  assert.equal(cwaPoint.properties.markerColor, CWA_TYPHOON_MARKER_COLOR);
  assert.equal(gdacsPoint.properties.markerColor, GDACS_ALERT_COLORS.Red);
});

test("TYPHOON_LEGEND covers the CWA color and all three GDACS alert colors, each distinct", () => {
  const colors = new Set(TYPHOON_LEGEND.map((e) => e.color));
  assert.equal(colors.size, 4, "expected 4 distinct legend colors (1 CWA + 3 GDACS alert levels)");
  assert.ok(TYPHOON_LEGEND.some((e) => e.color === CWA_TYPHOON_MARKER_COLOR));
  for (const color of Object.values(GDACS_ALERT_COLORS)) {
    assert.ok(TYPHOON_LEGEND.some((e) => e.color === color));
  }
});

// ---------------------------------------------------------------------------
// Pages / components — source-text + structural assertions, same convention
// as tests/global-watch-589-epidemics.test.mjs
// ---------------------------------------------------------------------------

const readSrc = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

const zhPageSrc = readSrc("app", "(zh)", "tools", "global-watch", "typhoons", "page.tsx");
const localePageSrc = readSrc("app", "[locale]", "tools", "global-watch", "typhoons", "page.tsx");
const itemSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchTyphoonsItem.tsx");
const clientSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchTyphoonsClient.tsx");
const globeSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchTyphoonsGlobe.tsx");

test("the zh typhoons page has its own metadata (title/description/keywords/canonical/hreflang), independent of the root shell", () => {
  assert.match(zhPageSrc, /title:\s*TITLE/);
  assert.match(zhPageSrc, /description:\s*DESCRIPTION/);
  assert.match(zhPageSrc, /keywords:\s*\[[^\]]*"颱風"/);
  assert.match(zhPageSrc, /canonical,\s*languages:\s*buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(zhPageSrc, /CANONICAL_PATH\s*=\s*"\/tools\/global-watch\/typhoons"/);
});

test("the zh typhoons page fetches both listActiveCwaTyphoons and listActiveTcEvents and merges them via buildTyphoonsGlobeData", () => {
  for (const src of [zhPageSrc, localePageSrc]) {
    assert.match(src, /listActiveCwaTyphoons\(\)/);
    assert.match(src, /listActiveTcEvents\(\)/);
    assert.match(src, /buildTyphoonsGlobeData\(/);
  }
});

test("the locale typhoons page follows the earthquakes locale-page pattern: generateStaticParams over PATH_LOCALES, notFound() guard, and hreflang alternates", () => {
  assert.match(localePageSrc, /export function generateStaticParams\(\)/);
  assert.match(localePageSrc, /PATH_LOCALES\.map/);
  assert.match(localePageSrc, /if \(!isPathLocale\(locale\)\) notFound\(\);/);
  assert.match(localePageSrc, /buildHreflangAlternates\(CANONICAL_PATH, baseUrl\)/);
  assert.match(localePageSrc, /CANONICAL_PATH = "\/tools\/global-watch\/typhoons"/);
  assert.match(localePageSrc, /getLocalizedPageMeta\("globalWatchTyphoons", locale\)/);
});

test("getLocalizedPageMeta('globalWatchTyphoons', locale) returns complete, non-empty, genuinely-translated en/ja/ko content", async () => {
  const { getLocalizedPageMeta } = await import("../lib/i18n/pageContent.ts");
  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedPageMeta("globalWatchTyphoons", locale);
    assert.ok(meta.title?.trim(), `${locale}: title must not be empty`);
    assert.ok(meta.description?.trim(), `${locale}: description must not be empty`);
  }
  const enMeta = getLocalizedPageMeta("globalWatchTyphoons", "en");
  assert.ok(!/[一-鿿]/.test(enMeta.title), "en: title should not contain untranslated Chinese");
  assert.ok(!/[一-鿿]/.test(enMeta.description), "en: description should not contain untranslated Chinese");
});

test("GlobeWatchTyphoonsItem renders the shared item-switcher tabs, the globe client, legend, and a link to /tools/weather-alerts", () => {
  assert.match(itemSrc, /<GlobeWatchItemTabs\s*\/>/);
  assert.match(itemSrc, /<GlobeWatchTyphoonsClient data=\{data\}\s*\/>/);
  assert.match(itemSrc, /<GlobeWatchTyphoonsLegend legend=\{data\.legend\}\s*\/>/);
  assert.match(itemSrc, /buildLocalizedPath\("\/tools\/weather-alerts", locale\)/);
});

test("GlobeWatchTyphoonsItem renders the explicit empty-state message when data.emptyState is true, and the list otherwise", () => {
  assert.match(itemSrc, /data\.emptyState\s*\?/);
  assert.match(itemSrc, /globe-watch-typhoons-empty-state/);
  assert.match(itemSrc, /目前無活動中的熱帶氣旋/);
});

test("GlobeWatchTyphoonsClient loads the globe via next/dynamic with ssr:false, gated behind the WebGL probe, and never mounts the globe when emptyState is true", () => {
  assert.match(clientSrc, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/GlobeWatchTyphoonsGlobe"\)/);
  assert.match(clientSrc, /ssr:\s*false/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*!data\.emptyState/);
  assert.match(clientSrc, /webglSupported\s*===\s*true\s*&&\s*data\.emptyState/);
  assert.match(clientSrc, /variant="empty"/);
});

test("GlobeWatchTyphoonsGlobe uses MapLibre's globe projection and paints marker color straight from the feature property (no business logic in the globe component)", () => {
  assert.match(globeSrc, /setProjection\(\{\s*type:\s*"globe"\s*\}\)/);
  assert.match(globeSrc, /"circle-color":\s*\["get",\s*"markerColor"\]/);
});

test("GlobeWatchStatusPanel's variant type now includes 'empty' alongside 'loading'/'unsupported' (and any sibling-item variant, e.g. #598's 'unconfigured')", () => {
  const statusPanelSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchStatusPanel.tsx");
  const variantLine = statusPanelSrc.match(/variant:\s*((?:"[a-z]+"\s*\|?\s*)+);/)?.[1] ?? "";
  for (const expected of ["loading", "unsupported", "empty"]) {
    assert.match(variantLine, new RegExp(`"${expected}"`), `expected variant union to include "${expected}"`);
  }
});

// ---------------------------------------------------------------------------
// DB query layer
// ---------------------------------------------------------------------------

test("lib/server/cwa/queries.ts's listActiveCwaTyphoons reads cwa_alerts filtered to the typhoon dataset, no new table/pipeline", () => {
  const src = readSrc("lib", "server", "cwa", "queries.ts");
  assert.match(src, /export const listActiveCwaTyphoons/);
  assert.match(src, /FROM cwa_alerts/);
  assert.match(src, /dataset_id = 'W-C0034-005'/);
});

test("lib/server/gdacs/queries.ts's listActiveTcEvents reads gdacs_events filtered to TC events only", () => {
  const src = readSrc("lib", "server", "gdacs", "queries.ts");
  assert.match(src, /export const listActiveTcEvents/);
  assert.match(src, /FROM gdacs_events/);
  assert.match(src, /event_type = 'TC'/);
});

// ---------------------------------------------------------------------------
// translatedPages.ts wiring
// ---------------------------------------------------------------------------

test("/tools/global-watch/typhoons is a registered translated path with full en/ja/ko/x-default hreflang", async () => {
  const { isTranslatedPath, buildLocalizedPath, buildHreflangAlternates, TRANSLATED_STANDALONE_PATHS, I18N_SCOPE_PAGES, scopeEntryPath } =
    await import("../lib/i18n/translatedPages.ts");

  const pathStr = "/tools/global-watch/typhoons";
  assert.ok(TRANSLATED_STANDALONE_PATHS.map(scopeEntryPath).includes(pathStr));
  assert.ok(I18N_SCOPE_PAGES.map(scopeEntryPath).includes(pathStr));
  assert.ok(isTranslatedPath(pathStr));
  assert.equal(buildLocalizedPath(pathStr, "en"), "/en/tools/global-watch/typhoons");
  assert.equal(buildLocalizedPath(pathStr, "ja"), "/ja/tools/global-watch/typhoons");
  assert.equal(buildLocalizedPath(pathStr, "ko"), "/ko/tools/global-watch/typhoons");

  const baseUrl = "https://health.j172.tw";
  const alternates = buildHreflangAlternates(pathStr, baseUrl);
  assert.ok(alternates);
  assert.equal(alternates["zh-TW"], `${baseUrl}/tools/global-watch/typhoons`);
  assert.equal(alternates.en, `${baseUrl}/en/tools/global-watch/typhoons`);
  assert.equal(alternates["x-default"], `${baseUrl}/tools/global-watch/typhoons`);
});

test("app/[locale]/tools/global-watch/typhoons/page.tsx exists (the i18n-routing-485 guardrail test enumerates TRANSLATED_STANDALONE_PATHS generically, so this just double-checks the file is really there)", () => {
  assert.ok(existsSync(path.join(ROOT_DIR, "app", "[locale]", "tools", "global-watch", "typhoons", "page.tsx")));
});

// ---------------------------------------------------------------------------
// GLOBE_WATCH_ITEMS registry — added LAST in this ticket's own workflow (see
// the PR description), after a final rebase onto origin/main, specifically
// to avoid colliding with any other item ticket landing concurrently (the
// real #588/#589 incident this registry's own doc comment documents).
// ---------------------------------------------------------------------------

test("the typhoons item is registered in the shared GLOBE_WATCH_ITEMS registry with a full per-locale label, alongside every other item already there", async () => {
  const { GLOBE_WATCH_ITEMS } = await import("../lib/tools/globeWatch/items.ts");
  const typhoons = GLOBE_WATCH_ITEMS.find((item) => item.key === "typhoons");
  assert.ok(typhoons, "expected a typhoons entry in GLOBE_WATCH_ITEMS");
  assert.equal(typhoons.path, "/tools/global-watch/typhoons");
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    const text = typhoons.label?.[locale];
    assert.ok(typeof text === "string" && text.trim().length > 0, `typhoons.label.${locale} must be non-empty`);
  }
  // Every item that existed before this ticket must still be present,
  // unremoved — this is the actual regression guard for the #588/#589
  // "two incompatible registries" incident repeating a third time.
  assert.ok(GLOBE_WATCH_ITEMS.some((item) => item.key === "earthquakes"), "earthquakes entry must still exist");
  assert.ok(GLOBE_WATCH_ITEMS.some((item) => item.key === "epidemics"), "epidemics entry must still exist");
});
