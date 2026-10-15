import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #594 (parent #583): the disasters item's "項目 → 地球資料" pure-logic
// seam — lib/tools/globeWatch/disastersTransform.ts (plus its two small
// name-lookup dictionaries). Same loader-hook convention as
// tests/global-watch-588-earthquakes.test.mjs, resolving "@/" imports and
// bare-extension relative imports to their .ts source.
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

const { buildDisastersGlobeData, GDACS_DISASTER_TYPES, isGdacsDisasterType } = await import(
  "../lib/tools/globeWatch/disastersTransform.ts"
);
const { resolveDisasterTypeName, DISASTER_TYPE_NAMES } = await import(
  "../lib/tools/globeWatch/disasterTypeNames.ts"
);
const { resolveAlertLevelColor, resolveAlertLevelName, GDACS_ALERT_LEVEL_NAMES } = await import(
  "../lib/tools/globeWatch/disasterAlertLevelNames.ts"
);
const { resolveCountryName } = await import("../lib/tools/globeWatch/disasterCountryNames.ts");

const baseRow = (overrides = {}) => ({
  eventType: "FL",
  eventId: "1001",
  alertLevel: "Orange",
  countryIso: "PHL",
  lat: 14.6,
  lng: 121.0,
  startTime: "2026-10-13T00:00:00Z",
  endTime: null,
  title: "Flood in Philippines",
  reportUrl: "https://www.gdacs.org/report.aspx?eventid=1001",
  ...overrides,
});

// ---------------------------------------------------------------------------
// AC: EQ、TC 不出現在這個項目的輸出
// ---------------------------------------------------------------------------

test("buildDisastersGlobeData drops EQ and TC rows even though the caller's query is supposed to exclude them already", () => {
  const rows = [
    baseRow({ eventType: "FL", eventId: "1" }),
    baseRow({ eventType: "EQ", eventId: "2" }),
    baseRow({ eventType: "TC", eventId: "3" }),
    baseRow({ eventType: "VO", eventId: "4" }),
  ];

  const data = buildDisastersGlobeData(rows);

  assert.equal(data.featureCollection.features.length, 2);
  for (const feature of data.featureCollection.features) {
    assert.ok(["FL", "VO", "DR", "WF"].includes(feature.properties.eventType));
  }
  assert.equal(data.listItems.length, 2);
  for (const item of data.listItems) {
    assert.ok(isGdacsDisasterType(item.eventType));
  }
});

test("isGdacsDisasterType rejects EQ/TC and anything else outside FL/VO/DR/WF", () => {
  assert.equal(isGdacsDisasterType("EQ"), false);
  assert.equal(isGdacsDisasterType("TC"), false);
  assert.equal(isGdacsDisasterType("XX"), false);
  assert.equal(isGdacsDisasterType(null), false);
  for (const type of GDACS_DISASTER_TYPES) {
    assert.equal(isGdacsDisasterType(type), true);
  }
});

// ---------------------------------------------------------------------------
// AC: 勾選/取消勾選正確過濾 features 與 listItems
// ---------------------------------------------------------------------------

test("enabledTypes filters both featureCollection.features and listItems", () => {
  const rows = [
    baseRow({ eventType: "FL", eventId: "1" }),
    baseRow({ eventType: "VO", eventId: "2" }),
    baseRow({ eventType: "DR", eventId: "3" }),
    baseRow({ eventType: "WF", eventId: "4" }),
  ];

  const onlyFloodAndWildfire = buildDisastersGlobeData(rows, ["FL", "WF"]);
  assert.deepEqual(
    onlyFloodAndWildfire.featureCollection.features.map((f) => f.properties.eventType).sort(),
    ["FL", "WF"],
  );
  assert.deepEqual(onlyFloodAndWildfire.listItems.map((i) => i.eventType).sort(), ["FL", "WF"]);

  const none = buildDisastersGlobeData(rows, []);
  assert.equal(none.featureCollection.features.length, 0);
  assert.equal(none.listItems.length, 0);

  const all = buildDisastersGlobeData(rows, GDACS_DISASTER_TYPES);
  assert.equal(all.featureCollection.features.length, 4);
  assert.equal(all.listItems.length, 4);
});

test("listItems are sorted most-severe alert level first, then most-recent startTime first", () => {
  const rows = [
    baseRow({ eventType: "FL", eventId: "1", alertLevel: "Green", startTime: "2026-10-14T00:00:00Z" }),
    baseRow({ eventType: "VO", eventId: "2", alertLevel: "Red", startTime: "2026-10-10T00:00:00Z" }),
    baseRow({ eventType: "DR", eventId: "3", alertLevel: "Orange", startTime: "2026-10-12T00:00:00Z" }),
    baseRow({ eventType: "WF", eventId: "4", alertLevel: "Red", startTime: "2026-10-13T00:00:00Z" }),
  ];

  const data = buildDisastersGlobeData(rows);
  assert.deepEqual(
    data.listItems.map((i) => i.id),
    ["WF-4", "VO-2", "DR-3", "FL-1"],
  );
});

// ---------------------------------------------------------------------------
// AC: 某災種目前沒有事件時顯示明確空狀態說明（emptyByType）
// ---------------------------------------------------------------------------

test("emptyByType reflects the full current dataset, independent of the enabledTypes checkbox filter", () => {
  const rows = [baseRow({ eventType: "FL", eventId: "1" })];

  // Only FL has any current row — VO/DR/WF should all report empty.
  const data = buildDisastersGlobeData(rows, GDACS_DISASTER_TYPES);
  assert.equal(data.emptyByType.FL, false);
  assert.equal(data.emptyByType.VO, true);
  assert.equal(data.emptyByType.DR, true);
  assert.equal(data.emptyByType.WF, true);

  // Unchecking FL on the UI must NOT make emptyByType.FL become true — that
  // would wrongly claim "no flood events exist" when there actually is one,
  // just hidden by the user's own filter.
  const filteredOut = buildDisastersGlobeData(rows, ["VO"]);
  assert.equal(filteredOut.emptyByType.FL, false, "unchecking FL must not flip its emptyByType to true");
  assert.equal(filteredOut.featureCollection.features.length, 0, "but it IS filtered out of the rendered output");
});

test("buildDisastersGlobeData with zero rows marks every disaster type empty", () => {
  const data = buildDisastersGlobeData([]);
  for (const type of GDACS_DISASTER_TYPES) {
    assert.equal(data.emptyByType[type], true);
  }
  assert.equal(data.featureCollection.features.length, 0);
  assert.equal(data.listItems.length, 0);
});

// ---------------------------------------------------------------------------
// AC: 警戒等級上色依 GDACS 紅/橙/綠規則
// ---------------------------------------------------------------------------

test("resolveAlertLevelColor maps Red/Orange/Green to the GDACS traffic-light colors and falls back for anything else", () => {
  assert.equal(resolveAlertLevelColor("Red"), GDACS_ALERT_LEVEL_NAMES.Red.color);
  assert.equal(resolveAlertLevelColor("Orange"), GDACS_ALERT_LEVEL_NAMES.Orange.color);
  assert.equal(resolveAlertLevelColor("Green"), GDACS_ALERT_LEVEL_NAMES.Green.color);
  // Three distinct colors, not a shared default.
  const colors = new Set([
    GDACS_ALERT_LEVEL_NAMES.Red.color,
    GDACS_ALERT_LEVEL_NAMES.Orange.color,
    GDACS_ALERT_LEVEL_NAMES.Green.color,
  ]);
  assert.equal(colors.size, 3);
  // Unrecognized level: a stable neutral fallback, not a guess.
  assert.equal(typeof resolveAlertLevelColor("Unknown"), "string");
});

test("buildDisastersGlobeData's feature/list markerColor matches resolveAlertLevelColor for each row's alert level", () => {
  const rows = [
    baseRow({ eventType: "FL", eventId: "1", alertLevel: "Red" }),
    baseRow({ eventType: "VO", eventId: "2", alertLevel: "Orange" }),
    baseRow({ eventType: "DR", eventId: "3", alertLevel: "Green" }),
  ];
  const data = buildDisastersGlobeData(rows);
  for (const feature of data.featureCollection.features) {
    assert.equal(feature.properties.markerColor, resolveAlertLevelColor(feature.properties.alertLevel));
  }
  for (const item of data.listItems) {
    assert.equal(item.markerColor, resolveAlertLevelColor(item.alertLevel));
  }
});

// ---------------------------------------------------------------------------
// AC: 國名/災種/警戒等級查表中文化，查不到時顯示原文
// ---------------------------------------------------------------------------

test("resolveDisasterTypeName translates FL/VO/DR/WF per locale and falls back to the raw code for anything unlisted", () => {
  assert.equal(resolveDisasterTypeName("FL", "zh-TW"), "洪水");
  assert.equal(resolveDisasterTypeName("FL", "en"), "Flood");
  assert.equal(resolveDisasterTypeName("VO", "ja"), "火山");
  assert.equal(resolveDisasterTypeName("WF", "ko"), "산불");
  // Unlisted/garbage code: original text verbatim, never a guess.
  assert.equal(resolveDisasterTypeName("EQ", "en"), "EQ");
  assert.equal(resolveDisasterTypeName("made-up", "zh-TW"), "made-up");
});

test("every GDACS disaster type has a non-empty label and emoji in all 4 locales", () => {
  for (const type of GDACS_DISASTER_TYPES) {
    const entry = DISASTER_TYPE_NAMES[type];
    assert.ok(entry.emoji.length > 0);
    for (const locale of ["zh-TW", "en", "ja", "ko"]) {
      assert.ok(resolveDisasterTypeName(type, locale).trim().length > 0, `${type}.${locale} must be non-empty`);
    }
  }
});

test("resolveAlertLevelName translates Green/Orange/Red per locale and falls back to the raw value for anything unlisted", () => {
  assert.equal(resolveAlertLevelName("Red", "zh-TW"), "紅色警戒");
  assert.equal(resolveAlertLevelName("Red", "en"), "Red alert");
  assert.equal(resolveAlertLevelName("Orange", "ja"), "オレンジ警戒");
  assert.equal(resolveAlertLevelName("Green", "ko"), "녹색 경보");
  // Unlisted/garbage value: original text verbatim, never a guess.
  assert.equal(resolveAlertLevelName("Purple", "en"), "Purple");
  assert.equal(resolveAlertLevelName("", "en"), "");
});

test("resolveCountryName translates a known ISO3 code per locale and falls back to the bare code for an unlisted one", () => {
  assert.equal(resolveCountryName("TWN", "zh-TW"), "台灣");
  assert.equal(resolveCountryName("PHL", "en"), "Philippines");
  assert.equal(resolveCountryName("JPN", "ja"), "日本");
  assert.equal(resolveCountryName("USA", "ko"), "미국");
  // Unlisted ISO3 code: falls back to the bare code itself, never a guess —
  // gdacs_events has no separate original-language country-name column to
  // fall back to (see disasterCountryNames.ts's doc comment), so the ISO3
  // code IS "the original text" here.
  assert.equal(resolveCountryName("ZZZ", "en"), "ZZZ");
  assert.equal(resolveCountryName(null, "en"), "");
  assert.equal(resolveCountryName("  twn  ", "zh-TW"), "台灣", "trims and uppercases before lookup");
});

// ---------------------------------------------------------------------------
// AC: 標題與內文保留英文原文並附原文連結 — the transform must never rewrite
// title/reportUrl, only pass them through untouched.
// ---------------------------------------------------------------------------

test("buildDisastersGlobeData never rewrites the original title or reportUrl", () => {
  const row = baseRow({
    title: "Tropical Storm-scale Flooding in Example Country",
    reportUrl: "https://www.gdacs.org/report.aspx?eventid=1001&eventtype=FL",
  });
  const data = buildDisastersGlobeData([row]);
  assert.equal(data.listItems[0].title, row.title);
  assert.equal(data.listItems[0].reportUrl, row.reportUrl);
  assert.equal(data.featureCollection.features[0].properties.title, row.title);
  assert.equal(data.featureCollection.features[0].properties.reportUrl, row.reportUrl);
});

test("buildDisastersGlobeData keeps a row with no countryIso instead of dropping it", () => {
  const row = baseRow({ countryIso: null });
  const data = buildDisastersGlobeData([row]);
  assert.equal(data.listItems.length, 1);
  assert.equal(data.listItems[0].countryIso, null);
});
