import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #597 (parent #583): WHO Disease Outbreak News (DON) pin overlay on
// the 國際疫情 (epidemics) item — the WHO-row-to-country-center-point pure
// transform, the country-center coordinate table's ISO coverage, the
// show/hide toggle's pure filter function, and source-text/structural
// assertions for the components, following the same loader-hook convention
// tests/global-watch-589-epidemics.test.mjs established.
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

const { buildWhoDonPinFeatures, findWhoDonPin, filterVisibleWhoDonPins } = await import(
  "../lib/tools/globeWatch/whoDonTransform.ts"
);
const { EPIDEMIC_COUNTRY_CENTERS, resolveCountryCenter } = await import(
  "../lib/tools/globeWatch/epidemicsCountryCenters.ts"
);
const { EPIDEMIC_COUNTRY_NAMES } = await import("../lib/tools/globeWatch/epidemicsCountryNames.ts");
const { RESOLVABLE_COUNTRY_ISO_CODES } = await import("../lib/server/who/countryIso.ts");

function makeRow(overrides) {
  return {
    articleId: "2026-DON620",
    title: "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo",
    publishDate: "2026-10-01T00:00:00.000Z",
    diseaseRaw: "Ebola disease caused by Bundibugyo virus",
    diseaseMapped: "伊波拉病毒感染",
    countryIso: "CD",
    url: "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON620",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildWhoDonPinFeatures — AC: 轉換模組能將 WHO DON 資料列對應到國家中心點座標
// ---------------------------------------------------------------------------

test("maps a WHO DON row with a resolved countryIso to its country-center-point pin", () => {
  const pins = buildWhoDonPinFeatures([makeRow()]);
  assert.equal(pins.length, 1);
  const pin = pins[0];
  assert.equal(pin.id, "2026-DON620");
  assert.equal(pin.iso, "CD");
  const center = resolveCountryCenter("CD");
  assert.equal(pin.lat, center.lat);
  assert.equal(pin.lng, center.lng);
  assert.equal(pin.url, "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON620");
});

test("ISO matching is case-insensitive and whitespace-tolerant", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ countryIso: " cd " })]);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].iso, "CD");
});

test("a row with no countryIso at all (e.g. a 'Global'/'Multi-country' WHO title) is dropped, never plotted with a guessed coordinate", () => {
  for (const countryIso of [null, undefined, ""]) {
    const pins = buildWhoDonPinFeatures([makeRow({ countryIso })]);
    assert.equal(pins.length, 0, `countryIso=${JSON.stringify(countryIso)} should produce zero pins`);
  }
});

test("a row whose countryIso isn't in the country-center table is dropped rather than guessed a location", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ countryIso: "ZZ" })]);
  assert.equal(pins.length, 0);
});

test("buildWhoDonPinFeatures maps multiple rows independently, preserving order", () => {
  const rows = [
    makeRow({ articleId: "a", countryIso: "TH" }),
    makeRow({ articleId: "b", countryIso: "JP" }),
    makeRow({ articleId: "c", countryIso: null }),
  ];
  const pins = buildWhoDonPinFeatures(rows);
  assert.deepEqual(pins.map((p) => p.id), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// disease fallback — AC: 疾病（查字典，查不到顯示原文）
// ---------------------------------------------------------------------------

test("pin.disease uses diseaseMapped when the dictionary resolved it", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ diseaseRaw: "Ebola disease", diseaseMapped: "伊波拉病毒感染" })]);
  assert.equal(pins[0].disease, "伊波拉病毒感染");
  assert.equal(pins[0].diseaseRaw, "Ebola disease");
  assert.equal(pins[0].diseaseMapped, "伊波拉病毒感染");
});

test("pin.disease falls back to the original diseaseRaw text, never a guessed translation, when diseaseMapped is null", () => {
  const unknown = "Some Brand New Pathogen XYZ";
  const pins = buildWhoDonPinFeatures([makeRow({ diseaseRaw: unknown, diseaseMapped: null })]);
  assert.equal(pins[0].disease, unknown);
  assert.equal(pins[0].diseaseMapped, null);
});

// ---------------------------------------------------------------------------
// findWhoDonPin
// ---------------------------------------------------------------------------

test("findWhoDonPin finds a pin by id, and returns null for an unselected/unknown id", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ articleId: "x", countryIso: "TH" })]);
  assert.equal(findWhoDonPin(pins, "x"), pins[0]);
  assert.equal(findWhoDonPin(pins, "not-there"), null);
  assert.equal(findWhoDonPin(pins, null), null);
  assert.equal(findWhoDonPin(pins, undefined), null);
});

// ---------------------------------------------------------------------------
// filterVisibleWhoDonPins — AC: 關閉切換後圖釘從地球上消失，國家上色不受影響
// (the toggle's entire show/hide behavior)
// ---------------------------------------------------------------------------

test("filterVisibleWhoDonPins returns the full pin list unchanged when visible=true", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ articleId: "x", countryIso: "TH" })]);
  assert.equal(filterVisibleWhoDonPins(pins, true), pins);
  assert.equal(filterVisibleWhoDonPins(pins, true).length, 1);
});

test("filterVisibleWhoDonPins returns an empty array when visible=false, regardless of how many pins exist", () => {
  const pins = buildWhoDonPinFeatures([
    makeRow({ articleId: "x", countryIso: "TH" }),
    makeRow({ articleId: "y", countryIso: "JP" }),
  ]);
  assert.deepEqual(filterVisibleWhoDonPins(pins, false), []);
});

test("toggling visible back on after off restores the original list without mutating it", () => {
  const pins = buildWhoDonPinFeatures([makeRow({ articleId: "x", countryIso: "TH" })]);
  const hidden = filterVisibleWhoDonPins(pins, false);
  assert.deepEqual(hidden, []);
  const shownAgain = filterVisibleWhoDonPins(pins, true);
  assert.deepEqual(shownAgain, pins);
  assert.equal(pins.length, 1, "the original pins array must not have been mutated by hiding/showing");
});

// ---------------------------------------------------------------------------
// EPIDEMIC_COUNTRY_CENTERS coverage — AC: 有測試覆蓋每一個 WHO DON 可能帶的 ISO
// ---------------------------------------------------------------------------

test("resolveCountryCenter returns null (never a guessed coordinate) for an unknown/empty ISO", () => {
  assert.equal(resolveCountryCenter("ZZ"), null);
  assert.equal(resolveCountryCenter(""), null);
  assert.equal(resolveCountryCenter(null), null);
  assert.equal(resolveCountryCenter(undefined), null);
});

test("every EPIDEMIC_COUNTRY_CENTERS entry has finite, plausible lat/lng values", () => {
  for (const [iso, point] of Object.entries(EPIDEMIC_COUNTRY_CENTERS)) {
    assert.ok(Number.isFinite(point.lat), `${iso}.lat must be finite`);
    assert.ok(Number.isFinite(point.lng), `${iso}.lng must be finite`);
    assert.ok(point.lat >= -90 && point.lat <= 90, `${iso}.lat must be a valid latitude`);
    assert.ok(point.lng >= -180 && point.lng <= 180, `${iso}.lng must be a valid longitude`);
  }
});

test("EPIDEMIC_COUNTRY_CENTERS covers every ISO key in EPIDEMIC_COUNTRY_NAMES", () => {
  const missing = Object.keys(EPIDEMIC_COUNTRY_NAMES).filter((iso) => !(iso in EPIDEMIC_COUNTRY_CENTERS));
  assert.deepEqual(missing, [], `EPIDEMIC_COUNTRY_CENTERS is missing: ${missing.join(", ")}`);
});

test("EPIDEMIC_COUNTRY_CENTERS covers every ISO code lib/server/who/countryIso.ts's resolver can ever return (the real 'every ISO a WHO DON row can carry' set)", () => {
  assert.ok(RESOLVABLE_COUNTRY_ISO_CODES.size > 50, "sanity check: expected dozens of resolvable ISO codes");
  const missing = [...RESOLVABLE_COUNTRY_ISO_CODES].filter((iso) => !(iso in EPIDEMIC_COUNTRY_CENTERS));
  assert.deepEqual(missing, [], `EPIDEMIC_COUNTRY_CENTERS is missing WHO-resolvable ISO(s): ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Components / API route — source-text + structural assertions, same
// convention as tests/global-watch-589-epidemics.test.mjs
// ---------------------------------------------------------------------------

const clientSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchEpidemicsClient.tsx"),
  "utf-8",
);
const globeSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchEpidemicsGlobe.tsx"),
  "utf-8",
);
const panelSrc = fs.readFileSync(
  path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "GlobeWatchWhoDonPinPanel.tsx"),
  "utf-8",
);
const routeSrc = fs.readFileSync(path.join(ROOT_DIR, "app", "api", "who", "outbreak-news", "route.ts"), "utf-8");

test("GlobeWatchEpidemicsClient renders a WHO-pin visibility toggle wired to filterVisibleWhoDonPins", () => {
  assert.match(clientSrc, /data-testid="who-don-pin-toggle"/);
  assert.match(clientSrc, /aria-pressed=\{showWhoPins\}/);
  assert.match(clientSrc, /setShowWhoPins/);
  assert.match(clientSrc, /filterVisibleWhoDonPins\(whoPins,\s*showWhoPins\)/);
});

test("GlobeWatchEpidemicsClient fetches WHO DON data from the new /api/who/outbreak-news route and builds pins via buildWhoDonPinFeatures", () => {
  assert.match(clientSrc, /fetch\("\/api\/who\/outbreak-news"\)/);
  assert.match(clientSrc, /buildWhoDonPinFeatures\(whoRows\)/);
});

test("GlobeWatchEpidemicsClient passes the already-filtered visibleWhoPins (not the raw whoPins) to the globe component", () => {
  assert.match(clientSrc, /whoPins=\{visibleWhoPins\}/);
});

test("GlobeWatchEpidemicsClient renders GlobeWatchWhoDonPinPanel only when a WHO pin is selected", () => {
  assert.match(clientSrc, /import GlobeWatchWhoDonPinPanel from "\.\/GlobeWatchWhoDonPinPanel"/);
  assert.match(clientSrc, /\{selectedWhoPin && \(/);
});

test("GlobeWatchEpidemicsGlobe gives the WHO pin layer its own source/layer id, distinct from the country choropleth's", () => {
  assert.match(globeSrc, /WHO_PIN_SOURCE_ID\s*=\s*"global-watch-epidemics-who-pins"/);
  assert.match(globeSrc, /WHO_PIN_LAYER_ID\s*=\s*"global-watch-epidemics-who-pins-layer"/);
  // The two must not be the same identifier as the country layers.
  assert.doesNotMatch(globeSrc, /WHO_PIN_LAYER_ID\s*=\s*COUNTRY_FILL_LAYER_ID/);
});

test("GlobeWatchEpidemicsGlobe's WHO-pin update effect only calls updateWhoPinSource, never setPaintProperty on the country fill layer", () => {
  const effectMatch = globeSrc.match(
    /Keep the WHO-pin source in sync[\s\S]*?useEffect\(\(\) => \{[\s\S]*?\}, \[whoPins\]\);/,
  );
  assert.ok(effectMatch, "expected to find the WHO-pin sync effect");
  assert.match(effectMatch[0], /updateWhoPinSource\(map, whoPins\)/);
  assert.doesNotMatch(effectMatch[0], /COUNTRY_FILL_LAYER_ID/);
});

test("GlobeWatchEpidemicsGlobe wires a click handler on the WHO pin layer that calls onSelectWhoPinRef", () => {
  assert.match(globeSrc, /map\.on\("click",\s*WHO_PIN_LAYER_ID/);
  assert.match(globeSrc, /onSelectWhoPinRef\.current\(id\)/);
});

test("GlobeWatchWhoDonPinPanel shows the original-language title, disease, country, publish date, and source link", () => {
  assert.match(panelSrc, /pin\.title/);
  assert.match(panelSrc, /pin\.disease\b/);
  assert.match(panelSrc, /resolveCountryName\(pin\.iso,\s*locale\)/);
  assert.match(panelSrc, /formatPublishDate\(pin\.publishDate,\s*locale\)/);
  assert.match(panelSrc, /pin\.url/);
  assert.match(panelSrc, /target="_blank"/);
});

test("the WHO outbreak-news API route calls getRecentWhoOutbreakNews and returns an ok/articles shape", () => {
  assert.match(routeSrc, /import \{ getRecentWhoOutbreakNews \} from "@\/lib\/server\/who\/queries"/);
  assert.match(routeSrc, /getRecentWhoOutbreakNews\(\)/);
  assert.match(routeSrc, /ok:\s*true,\s*articles/);
});
