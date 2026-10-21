import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #438 §R (SEO／AEO／GEO／Schema.org) — the remaining JSON-LD gaps:
//
//   藝文活動                → schema.org `Event`
//   我附近／機構清單          → `ItemList` of `Hospital`／`MedicalClinic`／`Pharmacy`／`Place`
//                            with `geo`／`address`／`telephone`
//   外語版 (/en /ja /ko)     → `inLanguage` + `translationOfWork` back to the zh page
//
// lib/server/seo/*.ts and lib/server/news/seo.ts are plain .ts with no JSX and
// no DB access (the DB-backed loaders are injected / lazily imported), so the
// builders are imported and exercised directly via the same loader shim as
// tests/nearby-page-466.test.mjs. The page/ToolPageShell wiring contains JSX,
// which Node's native type-stripping cannot parse, so it is verified by source
// inspection — this repo's established convention for `node --test`.

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
  // lib/i18n/dictionary.ts imports the locale JSON files without an import
  // attribute (TypeScript resolveJsonModule); plain `node --test` needs this
  // hook for that — same as tests/i18n-routing-485.test.mjs.
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const read = (...parts) => fs.readFileSync(path.join(ROOT_DIR, ...parts), "utf8");

const structured = await import("../lib/server/seo/structuredData.ts");
const pageLocaleModule = await import("../lib/server/seo/pageLocale.ts");
const nearbyJsonLd = await import("../lib/server/seo/nearbyJsonLd.ts");
const loaderModule = await import("../lib/server/seo/toolPageStructuredData.ts");
const seo = await import("../lib/server/news/seo.ts");
const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { GUIDES, buildGuide } = await import("../lib/server/tools/navModel.ts");
const { NEARBY_DEFAULT_TYPES } = await import("../lib/server/nearby/registry.ts");
const { facilitySearchConfigs } = await import("../app/(zh)/tools/facilityConfigs.ts");
const translatedPages = await import("../lib/i18n/translatedPages.ts");
const { getLocalizedToolMeta } = await import("../lib/i18n/toolContent.ts");
const { clearMemoizedQueries } = await import("../lib/server/cache/memo.ts");

const {
  serializeJsonLd,
  parseCulturalEventDate,
  buildCulturalEventsJsonLd,
  buildFacilityListJsonLd,
  resolveFacilitySchemaType,
  toValidCoordinate,
  buildNearbyGraphJsonLd,
  buildLocalizedWebPageJsonLd,
} = structured;

const BASE = seo.getBaseUrl();
const NOW = new Date("2026-10-15T04:00:00Z"); // 2026-10-15 12:00 in Taiwan
const ISO_EVENT_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}\+08:00)?$/;

// ---------------------------------------------------------------------------
// serializeJsonLd: `<` must never survive into the <script> payload
// ---------------------------------------------------------------------------

test("serializeJsonLd escapes every `<` so a hostile string cannot close the <script> tag", () => {
  const hostile = {
    name: "</script><script>alert(1)</script>",
    nested: ["<!-- x -->", { v: "<img src=x onerror=1>" }],
  };
  const out = serializeJsonLd(hostile);
  assert.ok(!out.includes("<"), "no raw `<` may remain in the serialized JSON");
  assert.ok(out.includes("\\u003c/script>"));
  assert.deepEqual(JSON.parse(out), hostile, "the escaped output must parse back to the identical value");
});

test("serializeJsonLd also escapes U+2028 / U+2029 and keeps the output valid JSON", () => {
  const value = { s: `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c` };
  const out = serializeJsonLd(value);
  assert.ok(!out.includes(String.fromCharCode(0x2028)) && !out.includes(String.fromCharCode(0x2029)));
  assert.deepEqual(JSON.parse(out), value);
});

test("serializeJsonLd never returns undefined (JSON.stringify(undefined) would)", () => {
  assert.equal(serializeJsonLd(undefined), "null");
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test("parseCulturalEventDate understands the shapes cultural_events stores and rejects the rest", () => {
  assert.deepEqual(parseCulturalEventDate("2026/10/31"), { date: "2026-10-31", time: null });
  assert.deepEqual(parseCulturalEventDate("2026/10/31 14:30:00"), { date: "2026-10-31", time: "14:30:00" });
  assert.deepEqual(parseCulturalEventDate("2026-1-5"), { date: "2026-01-05", time: null });
  // Java-style feed leak: the 12:00:00 AM part is a placeholder, not a real time.
  assert.deepEqual(parseCulturalEventDate("Aug 9, 2026 12:00:00 AM"), { date: "2026-08-09", time: null });
  // A literal midnight is treated as date-only rather than asserting a midnight start.
  assert.deepEqual(parseCulturalEventDate("2026/10/31 00:00:00"), { date: "2026-10-31", time: null });
  for (const bad of ["", "   ", null, undefined, "常態開放", "2026年時間未定", "9月-9月", "2026/02/30", "2026/13/01", "2026-08-22，09-12"]) {
    assert.equal(parseCulturalEventDate(bad), null, `${JSON.stringify(bad)} is not a date`);
  }
});

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

const makeEvent = (overrides = {}) => ({
  id: "evt-1",
  title: "風動室內樂團音樂會",
  category: "1",
  categoryLabel: "音樂表演",
  description: "<p>宮崎駿動畫音樂精選</p>",
  imageUrl: "https://img.example.tw/a.jpg",
  masterUnit: "風動室內樂團",
  startDate: "2026/10/31",
  endDate: "2026/12/13",
  sourceWebPromote: "https://www.opentix.life/program/1",
  webSales: null,
  shows: [
    {
      time: "2026/10/31 14:30:00",
      location: "桃園市桃園區中正路1188號",
      locationName: "桃園展演中心展演廳",
      city: "桃園市",
      latitude: 25.0175106,
      longitude: 121.2986658,
      endTime: "2026/10/31 16:10:00",
    },
  ],
  ...overrides,
});

test("buildCulturalEventsJsonLd emits schema.org Event nodes with every required property", () => {
  const graph = buildCulturalEventsJsonLd([makeEvent()], { now: NOW });
  assert.equal(graph["@context"], "https://schema.org");
  assert.equal(graph["@graph"].length, 1);
  const event = graph["@graph"][0];

  assert.equal(event["@type"], "Event");
  assert.equal(event.name, "風動室內樂團音樂會");
  assert.equal(event.startDate, "2026-10-31T14:30:00+08:00");
  assert.equal(event.endDate, "2026-10-31T16:10:00+08:00");
  assert.equal(event.eventStatus, "https://schema.org/EventScheduled");
  assert.equal(event.eventAttendanceMode, "https://schema.org/OfflineEventAttendanceMode");
  assert.equal(event.location["@type"], "Place");
  assert.equal(event.location.name, "桃園展演中心展演廳");
  assert.equal(event.location.address["@type"], "PostalAddress");
  assert.equal(event.location.address.streetAddress, "桃園市桃園區中正路1188號");
  assert.equal(event.location.address.addressCountry, "TW");
  assert.deepEqual(event.location.geo, { "@type": "GeoCoordinates", latitude: 25.0175106, longitude: 121.2986658 });
  assert.equal(event.url, "https://www.opentix.life/program/1");
  assert.deepEqual(event.image, ["https://img.example.tw/a.jpg"]);
  assert.deepEqual(event.organizer, { "@type": "Organization", name: "風動室內樂團" });
  assert.equal(event.description, "宮崎駿動畫音樂精選", "HTML tags are stripped from the description");
  assert.equal(event["@id"], `${BASE}/tools/cultural-events#event-evt-1`);
});

test("buildCulturalEventsJsonLd skips past events, venues without a start date, events without a location, and bad dates", () => {
  const items = [
    makeEvent({ id: "past", startDate: "2026/01/01", endDate: "2026/01/02", shows: [{ time: "2026/01/01 19:00:00", location: "台北市", locationName: "A", latitude: null, longitude: null }] }),
    makeEvent({ id: "venue", startDate: "", endDate: "", shows: [{ time: "常態開放", location: "台北市信義路", locationName: "常設場館", latitude: 25, longitude: 121 }] }),
    makeEvent({ id: "noloc", shows: [{ time: "2026/11/01 19:00:00", location: "", locationName: "", latitude: 25, longitude: 121 }] }),
    makeEvent({ id: "noshows", shows: [] }),
    makeEvent({ id: "untitled", title: "   " }),
    makeEvent({ id: "good" }),
  ];
  const graph = buildCulturalEventsJsonLd(items, { now: NOW });
  assert.deepEqual(
    graph["@graph"].map((node) => node["@id"].split("#event-")[1]),
    ["good"],
  );
});

test("buildCulturalEventsJsonLd omits `geo` instead of emitting empty coordinates", () => {
  const noGeo = makeEvent({
    shows: [{ time: "2026/11/01 19:00:00", location: "台北市信義路", locationName: "某場館", latitude: null, longitude: null }],
  });
  const zeroGeo = makeEvent({
    id: "zero",
    shows: [{ time: "2026/11/01 19:00:00", location: "台北市信義路", locationName: "某場館", latitude: 0, longitude: 0 }],
  });
  const graph = buildCulturalEventsJsonLd([noGeo, zeroGeo], { now: NOW });
  assert.equal(graph["@graph"].length, 2);
  for (const event of graph["@graph"]) assert.ok(!("geo" in event.location), "no geo key when coordinates are unusable");
});

test("buildCulturalEventsJsonLd picks the next upcoming show, not one that already happened", () => {
  const multi = makeEvent({
    shows: [
      { time: "2026/09/01 19:00:00", location: "台北市A路", locationName: "過去場次", latitude: 25, longitude: 121, endTime: "2026/09/01 21:00:00" },
      { time: "2026/11/20 19:00:00", location: "高雄市B路", locationName: "未來場次", latitude: 22.6, longitude: 120.3, endTime: "2026/11/20 21:00:00" },
    ],
    startDate: "2026/09/01",
    endDate: "2026/11/20",
  });
  const [event] = buildCulturalEventsJsonLd([multi], { now: NOW })["@graph"];
  assert.equal(event.location.name, "未來場次");
  assert.equal(event.startDate, "2026-11-20T19:00:00+08:00");
});

test("buildCulturalEventsJsonLd stays small (default cap 10), honours `max`, and returns null when nothing qualifies", () => {
  const many = Array.from({ length: 25 }, (_, index) => makeEvent({ id: `e${index}` }));
  assert.equal(buildCulturalEventsJsonLd(many, { now: NOW })["@graph"].length, 10);
  assert.equal(buildCulturalEventsJsonLd(many, { now: NOW, max: 3 })["@graph"].length, 3);
  assert.equal(buildCulturalEventsJsonLd([], { now: NOW }), null);
  assert.equal(buildCulturalEventsJsonLd([makeEvent({ id: "p", startDate: "2020/01/01", endDate: "2020/01/02", shows: [{ time: "2020/01/01 10:00:00", location: "x", locationName: "y" }] })], { now: NOW }), null);
});

test("buildCulturalEventsJsonLd on a /en page uses the /en URL for its @ids; event text is untouched government data", () => {
  const [event] = buildCulturalEventsJsonLd([makeEvent()], { now: NOW, locale: "en" })["@graph"];
  assert.equal(event["@id"], `${BASE}/en/tools/cultural-events#event-evt-1`);
  assert.equal(event.name, "風動室內樂團音樂會");
});

test("the serialized Event graph cannot break out of its <script> even with a hostile title/venue", () => {
  // Well-formed tags are stripped by the builder; an unterminated `<` (which
  // has no closing `>` to strip) survives into the data and is what the
  // serializer's escaping has to neutralize.
  const hostile = makeEvent({
    title: "場次 <img src=x onerror=alert(1) 與 </script",
    description: "<script>alert(1)</script> 說明 < 內文",
    shows: [{ time: "2026/11/01 19:00:00", location: "路 </script", locationName: "場館 < 2F </script", latitude: 25, longitude: 121 }],
  });
  const graph = buildCulturalEventsJsonLd([hostile], { now: NOW });
  const [event] = graph["@graph"];
  assert.equal(event["@type"], "Event");
  assert.ok(event.name.includes("<img"), "the unterminated `<` really is in the data");

  const serialized = serializeJsonLd(graph);
  assert.ok(!serialized.includes("<"), "serialized Event JSON-LD contains no raw `<`");
  assert.ok(!/<\/script/i.test(serialized));
  assert.deepEqual(JSON.parse(serialized), graph, "escaping is lossless");
});

test("the bundled cultural-events seed yields only well-formed Event nodes (or none)", () => {
  const seed = JSON.parse(read("data", "cultural-events-seed.json"));
  const graph = buildCulturalEventsJsonLd(seed.events, { now: NOW });
  if (graph === null) return;
  assert.ok(graph["@graph"].length >= 1 && graph["@graph"].length <= 10);
  const ids = new Set();
  for (const event of graph["@graph"]) {
    assert.equal(event["@type"], "Event");
    assert.ok(event.name.length > 0);
    assert.match(event.startDate, ISO_EVENT_DATE_RE);
    if (event.endDate) assert.ok(event.endDate >= event.startDate, "endDate never precedes startDate");
    assert.ok(event.location.name.length > 0);
    assert.equal(event.location.address["@type"], "PostalAddress");
    if (event.location.geo) {
      assert.ok(Number.isFinite(event.location.geo.latitude) && Number.isFinite(event.location.geo.longitude));
    }
    assert.ok(!ids.has(event["@id"]), "event @ids are unique");
    ids.add(event["@id"]);
  }
});

// ---------------------------------------------------------------------------
// Facility ItemList (Hospital / MedicalClinic / Pharmacy / Place, with geo)
// ---------------------------------------------------------------------------

const makeFacility = (overrides = {}) => ({
  name: "臺大醫院",
  address: "臺北市中正區中山南路7號",
  phone: "02-23123456",
  lat: 25.0403,
  lng: 121.5188,
  service_item: "醫學中心",
  ...overrides,
});

test("resolveFacilitySchemaType maps NHI tiers to Hospital, other clinics to MedicalClinic, pharmacies to Pharmacy, the rest to Place", () => {
  assert.equal(resolveFacilitySchemaType("clinic", "醫學中心", "臺大醫院"), "Hospital");
  assert.equal(resolveFacilitySchemaType("clinic", "區域醫院", "某醫院"), "Hospital");
  assert.equal(resolveFacilitySchemaType("clinic", "地區醫院", "某醫院"), "Hospital");
  assert.equal(resolveFacilitySchemaType("clinic", "基層診所", "王小明診所"), "MedicalClinic");
  assert.equal(resolveFacilitySchemaType("clinic", null, "未標示院所"), "MedicalClinic");
  assert.equal(resolveFacilitySchemaType("clinic", null, "某某醫院"), "Hospital");
  assert.equal(resolveFacilitySchemaType("pharmacy", "健保特約藥局", "某藥局"), "Pharmacy");
  for (const type of ["aed", "public_toilet", "cool_spot"]) assert.equal(resolveFacilitySchemaType(type, null, "x"), "Place");
});

test("buildFacilityListJsonLd emits an ItemList whose items carry name, address, telephone and geo", () => {
  const list = buildFacilityListJsonLd(
    { facilityType: "clinic", name: "醫療院所查詢", description: "查詢全民健保特約醫療院所", facilities: [makeFacility(), makeFacility({ name: "某診所", service_item: "基層診所", phone: null })] },
    { canonicalPath: "/tools/clinics" },
  );
  assert.equal(list["@context"], "https://schema.org");
  assert.equal(list["@type"], "ItemList");
  assert.equal(list["@id"], `${BASE}/tools/clinics#facilities`);
  assert.equal(list.name, "醫療院所查詢");
  assert.equal(list.itemListElement.length, 2);

  const [first, second] = list.itemListElement;
  assert.equal(first["@type"], "ListItem");
  assert.equal(first.position, 1);
  assert.equal(first.item["@type"], "Hospital");
  assert.equal(first.item.name, "臺大醫院");
  assert.deepEqual(first.item.address, { "@type": "PostalAddress", streetAddress: "臺北市中正區中山南路7號", addressCountry: "TW" });
  assert.equal(first.item.telephone, "02-23123456");
  assert.deepEqual(first.item.geo, { "@type": "GeoCoordinates", latitude: 25.0403, longitude: 121.5188 });

  assert.equal(second.position, 2);
  assert.equal(second.item["@type"], "MedicalClinic");
  assert.ok(!("telephone" in second.item), "no empty telephone is emitted");
});

test("buildFacilityListJsonLd skips facilities lacking usable coordinates instead of emitting an empty geo", () => {
  const facilities = [
    makeFacility({ name: "無座標 null", lat: null, lng: null }),
    makeFacility({ name: "無座標 空字串", lat: "", lng: "" }),
    makeFacility({ name: "NaN", lat: "abc", lng: "121" }),
    makeFacility({ name: "零點", lat: 0, lng: 0 }),
    makeFacility({ name: "超出範圍", lat: 123, lng: 500 }),
    makeFacility({ name: "只有緯度", lat: 25, lng: null }),
    makeFacility({ name: "字串座標(DECIMAL)", lat: "25.0403000", lng: "121.5188000" }),
  ];
  const list = buildFacilityListJsonLd({ facilityType: "clinic", name: "x", facilities }, { canonicalPath: "/tools/clinics" });
  assert.deepEqual(list.itemListElement.map((entry) => entry.item.name), ["字串座標(DECIMAL)"]);
  const { geo } = list.itemListElement[0].item;
  assert.equal(typeof geo.latitude, "number");
  assert.equal(typeof geo.longitude, "number");
  for (const entry of list.itemListElement) assert.ok(entry.item.geo, "every emitted item has a geo node");
});

test("buildFacilityListJsonLd returns null when no row has coordinates, and caps the list (default 10)", () => {
  assert.equal(buildFacilityListJsonLd({ facilityType: "aed", name: "x", facilities: [] }, { canonicalPath: "/tools/aed" }), null);
  assert.equal(
    buildFacilityListJsonLd({ facilityType: "aed", name: "x", facilities: [makeFacility({ lat: null, lng: null })] }, { canonicalPath: "/tools/aed" }),
    null,
  );
  const many = Array.from({ length: 30 }, (_, index) => makeFacility({ name: `院所${index}` }));
  const list = buildFacilityListJsonLd({ facilityType: "clinic", name: "x", facilities: many }, { canonicalPath: "/tools/clinics" });
  assert.equal(list.itemListElement.length, 10);
  assert.deepEqual(list.itemListElement.map((entry) => entry.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("buildFacilityListJsonLd on a /ja page uses the /ja URL as the list identity", () => {
  const list = buildFacilityListJsonLd(
    { facilityType: "pharmacy", name: "薬局検索", facilities: [makeFacility({ service_item: "健保特約藥局" })] },
    { canonicalPath: "/tools/pharmacies", locale: "ja" },
  );
  assert.equal(list["@id"], `${BASE}/ja/tools/pharmacies#facilities`);
  assert.equal(list.itemListElement[0].item["@type"], "Pharmacy");
});

test("the serialized facility ItemList cannot break out of its <script> with a hostile name/address", () => {
  const list = buildFacilityListJsonLd(
    {
      facilityType: "pharmacy",
      name: "藥局",
      facilities: [makeFacility({ name: "藥局 <img src=x onerror=1 </script", address: "路 < 2F </script", phone: "02-1 <" })],
    },
    { canonicalPath: "/tools/pharmacies" },
  );
  assert.ok(list.itemListElement[0].item.name.includes("<img"), "the unterminated `<` really is in the data");
  const serialized = serializeJsonLd(list);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), list, "escaping is lossless");
});

test("toValidCoordinate accepts real WGS84 pairs (numbers or numeric strings) and nothing else", () => {
  assert.deepEqual(toValidCoordinate(25.04, 121.51), { latitude: 25.04, longitude: 121.51 });
  assert.deepEqual(toValidCoordinate("25.04", "121.51"), { latitude: 25.04, longitude: 121.51 });
  for (const [lat, lng] of [[null, 1], [1, undefined], ["", ""], [NaN, 1], [Infinity, 1], [0, 0], [91, 0], [0, 181]]) {
    assert.equal(toValidCoordinate(lat, lng), null, `${lat},${lng} must be rejected`);
  }
});

// ---------------------------------------------------------------------------
// 我附近 — ItemList of facility TYPES, never of per-user results
// ---------------------------------------------------------------------------

test("buildNearbyJsonLdEntries covers all 8 default nearby types with real, absolute tool-page URLs (zh)", () => {
  const entries = nearbyJsonLd.buildNearbyJsonLdEntries(BASE);
  assert.equal(entries.length, NEARBY_DEFAULT_TYPES.length);
  assert.equal(entries.length, 8);
  for (const [index, entry] of entries.entries()) {
    assert.equal(entry.name, NEARBY_DEFAULT_TYPES[index].label);
    assert.match(entry.url, new RegExp(`^${BASE.replace(/[.]/g, "\\.")}/tools/[a-z-]+$`), `${entry.name} links to a tool page`);
    assert.ok(entry.description && entry.description.length > 0);
  }
  const urls = entries.map((entry) => entry.url);
  assert.ok(urls.includes(`${BASE}/tools/er-status`) && urls.includes(`${BASE}/tools/disaster-map`), "er and shelter link to their tool pages");
});

test("buildNearbyGraphJsonLd (zh) is a WebPage + ItemList with positions, names and URLs, and no coordinates", () => {
  const graph = buildNearbyGraphJsonLd({
    name: "我附近",
    description: "一次定位看全部急用點位",
    entries: nearbyJsonLd.buildNearbyJsonLdEntries(BASE),
  });
  const [page, list] = graph["@graph"];
  assert.equal(page["@type"], "WebPage");
  assert.equal(page.url, `${BASE}/nearby`);
  assert.equal(page.inLanguage, "zh-TW");
  assert.ok(!("translationOfWork" in page), "the zh page is the original, not a translation");
  assert.deepEqual(page.mainEntity, { "@id": list["@id"] });

  assert.equal(list["@type"], "ItemList");
  assert.equal(list.itemListElement.length, 8);
  list.itemListElement.forEach((entry, index) => {
    assert.equal(entry["@type"], "ListItem");
    assert.equal(entry.position, index + 1);
    assert.ok(entry.name && entry.url);
  });

  const text = serializeJsonLd(graph);
  assert.ok(!/latitude|longitude|"geo"|GeoCoordinates/.test(text), "/nearby JSON-LD must never carry coordinates of any kind");
  assert.ok(!text.includes("<"));
});

test("buildNearbyGraphJsonLd on /en /ja /ko carries inLanguage, localized names/URLs and translationOfWork back to /nearby", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const entries = nearbyJsonLd.buildNearbyJsonLdEntries(BASE, locale);
    const graph = buildNearbyGraphJsonLd({ name: `nearby-${locale}`, description: "d", entries }, { locale });
    const [page, list] = graph["@graph"];
    assert.equal(page.url, `${BASE}/${locale}/nearby`);
    assert.equal(page["@id"], `${BASE}/${locale}/nearby#webpage`);
    assert.equal(page.inLanguage, locale);
    assert.deepEqual(page.translationOfWork, { "@type": "WebPage", url: `${BASE}/nearby`, inLanguage: "zh-TW" });
    assert.equal(list.itemListElement.length, 8);
    list.itemListElement.forEach((entry, index) => {
      assert.ok(entry.name.length > 0);
      // ja legitimately shares some labels with zh (e.g. 避難所), so only en/ko can be held to "not the zh label".
      if (locale !== "ja") {
        assert.notEqual(entry.name, NEARBY_DEFAULT_TYPES[index].label, `${locale} entry "${entry.name}" must not fall back to the zh label`);
        assert.ok(!/[一-鿿]/.test(entry.name), `${locale} entry name "${entry.name}" must not contain Chinese characters`);
      }
      assert.ok(!("description" in entry), "Chinese data-source descriptions are not put into a foreign-language page's JSON-LD");
    });
    // A type with its own translated tool page links to that locale's page.
    assert.ok(list.itemListElement.some((entry) => entry.url === `${BASE}/${locale}/tools/aed`));
    // A type without one links to the (zh-only) page rather than a 404.
    assert.ok(list.itemListElement.some((entry) => entry.url === `${BASE}/tools/disaster-map` || entry.url === `${BASE}/${locale}/tools/disaster-map`));
  }
});

// ---------------------------------------------------------------------------
// 外語版 — inLanguage + translationOfWork
// ---------------------------------------------------------------------------

test("localizedCanonicalPath mirrors lib/i18n buildLocalizedPath for every locale and path shape", () => {
  for (const locale of ["zh-TW", "en", "ja", "ko"]) {
    for (const p of ["/", "/nearby", "/tools/aed", "/guides/typhoon-earthquake", "/tools/global-watch/earthquakes"]) {
      assert.equal(pageLocaleModule.localizedCanonicalPath(p, locale), translatedPages.buildLocalizedPath(p, locale), `${locale} ${p}`);
    }
  }
});

test("default (zh) output of the three existing page builders is unchanged: zh inLanguage, no translationOfWork", () => {
  const tool = TOOL_CATALOG.find((entry) => entry.slug === "aed");
  const toolPage = seo.buildToolGraphJsonLd(tool)["@graph"].find((node) => node["@id"]?.endsWith("#webpage"));
  assert.deepEqual(toolPage.inLanguage, ["zh-TW", "zh-Hant"]);
  assert.equal(toolPage.url, `${BASE}/tools/aed`);
  assert.ok(!("translationOfWork" in toolPage));

  const guidePage = seo.buildGuideGraphJsonLd(buildGuide(GUIDES[0].slug))["@graph"].find((node) => node["@id"]?.endsWith("#webpage"));
  assert.equal(guidePage.inLanguage, "zh-TW");
  assert.ok(!("translationOfWork" in guidePage));

  const homePage = seo.buildHomeGraphJsonLd([])["@graph"].find((node) => node["@id"] === `${BASE}/#webpage`);
  assert.equal(homePage.url, BASE);
  assert.equal(homePage.inLanguage, "zh-TW");
  assert.ok(!("translationOfWork" in homePage));
});

test("buildToolGraphJsonLd for every translated tool x locale: locale URL, inLanguage, translationOfWork, localized text", () => {
  // 只確認清單不是空的／仍是一整批：下架翻譯過的工具（如 #728）會讓數量減少，不寫死精確下限。
  assert.ok(translatedPages.TRANSLATED_TOOL_SLUGS.length >= 10);
  for (const slug of translatedPages.TRANSLATED_TOOL_SLUGS) {
    const catalogEntry = TOOL_CATALOG.find((tool) => tool.slug === slug);
    assert.ok(catalogEntry, `${slug} is in the catalog`);
    for (const locale of ["en", "ja", "ko"]) {
      // Exactly how ToolPageShell merges the entry before building the graph.
      const entry = { ...catalogEntry, ...getLocalizedToolMeta(slug, locale) };
      const graph = seo.buildToolGraphJsonLd(entry, { locale });
      const page = graph["@graph"].find((node) => node["@id"] === `${BASE}/${locale}/tools/${slug}#webpage`);
      assert.ok(page, `${locale}/${slug}: page node is identified by its locale URL`);
      assert.equal(page.url, `${BASE}/${locale}/tools/${slug}`);
      assert.equal(page.inLanguage, locale);
      assert.deepEqual(page.translationOfWork, { "@type": "WebPage", url: `${BASE}/tools/${slug}`, inLanguage: "zh-TW" });
      assert.equal(page.name, entry.title, "page name is the localized title");

      const app = graph["@graph"].find((node) => node["@type"] === "WebApplication");
      assert.equal(app.url, `${BASE}/${locale}/tools/${slug}`);
      assert.equal(app.inLanguage, locale);
      assert.equal(page.mainEntity["@id"], app["@id"]);

      const breadcrumb = graph["@graph"].find((node) => node["@type"] === "BreadcrumbList");
      assert.equal(breadcrumb.itemListElement.at(-1).item, `${BASE}/${locale}/tools/${slug}`);

      // No node may still identify itself with the zh page's @id.
      assert.ok(!JSON.stringify(graph).includes(`"@id":"${BASE}/tools/${slug}#`), "no stale zh @id");
    }
  }
});

test("buildGuideGraphJsonLd and buildHomeGraphJsonLd localize the page node with inLanguage + translationOfWork", () => {
  const guide = buildGuide("typhoon-earthquake");
  const guidePage = seo.buildGuideGraphJsonLd(guide, { locale: "ko" })["@graph"].find((node) => node["@type"] === "CollectionPage");
  assert.equal(guidePage.url, `${BASE}/ko/guides/typhoon-earthquake`);
  assert.equal(guidePage.inLanguage, "ko");
  assert.deepEqual(guidePage.translationOfWork, { "@type": "WebPage", url: `${BASE}/guides/typhoon-earthquake`, inLanguage: "zh-TW" });

  const home = seo
    .buildHomeGraphJsonLd([], { locale: "en", canonicalPath: "/", name: "Healthz", description: "English description" })
    ["@graph"].find((node) => node["@type"] === "WebPage");
  assert.equal(home.url, `${BASE}/en`);
  assert.equal(home["@id"], `${BASE}/en#webpage`);
  assert.equal(home.name, "Healthz");
  assert.equal(home.description, "English description");
  assert.equal(home.inLanguage, "en");
  assert.deepEqual(home.translationOfWork, { "@type": "WebPage", url: BASE, inLanguage: "zh-TW" });
});

test("buildLocalizedWebPageJsonLd (global-watch earthquakes/typhoons) is a self-contained localized WebPage", () => {
  const node = buildLocalizedWebPageJsonLd(
    { name: "Earthquakes", description: "desc", canonicalPath: "/tools/global-watch/earthquakes" },
    { locale: "ja" },
  );
  assert.equal(node["@context"], "https://schema.org");
  assert.equal(node["@type"], "WebPage");
  assert.equal(node.url, `${BASE}/ja/tools/global-watch/earthquakes`);
  assert.equal(node.inLanguage, "ja");
  assert.equal(node.translationOfWork.url, `${BASE}/tools/global-watch/earthquakes`);
  assert.equal(node.name, "Earthquakes");
});

// ---------------------------------------------------------------------------
// The loader: which pages get what, injected data only, never breaks the page
// ---------------------------------------------------------------------------

test("loader: only cultural-events and the 5 facility-list tools get a supplement node", async () => {
  clearMemoizedQueries();
  assert.deepEqual(
    [...loaderModule.FACILITY_LIST_JSONLD_SLUGS].sort(),
    ["aed", "clinics", "cool-spots", "pharmacies", "public-toilets"],
  );
  const deps = {
    searchEvents: async () => [makeEvent()],
    searchFacilities: async () => [makeFacility()],
    now: () => NOW,
  };
  assert.equal(await loaderModule.loadToolPageSupplementJsonLd({ slug: "bmi", title: "BMI", deps }), null);
  assert.equal(await loaderModule.loadToolPageSupplementJsonLd({ slug: "uv", title: "UV", deps }), null);
});

test("loader: cultural-events yields the Event graph and passes the page locale through", async () => {
  clearMemoizedQueries();
  const deps = { searchEvents: async () => [makeEvent()], searchFacilities: async () => [], now: () => NOW };
  const zh = await loaderModule.loadToolPageSupplementJsonLd({ slug: "cultural-events", title: "藝文活動", deps });
  assert.equal(zh["@graph"][0]["@type"], "Event");
  assert.equal(zh["@graph"][0]["@id"], `${BASE}/tools/cultural-events#event-evt-1`);

  clearMemoizedQueries();
  const en = await loaderModule.loadToolPageSupplementJsonLd({ slug: "cultural-events", title: "Arts Events", locale: "en", deps });
  assert.equal(en["@graph"][0]["@id"], `${BASE}/en/tools/cultural-events#event-evt-1`);
});

test("loader: each facility-list tool queries its own facility_type with a fixed, location-independent sample", async () => {
  const expectedTypes = {
    clinics: ["clinic", "Hospital"],
    pharmacies: ["pharmacy", "Pharmacy"],
    aed: ["aed", "Place"],
    "public-toilets": ["public_toilet", "Place"],
    "cool-spots": ["cool_spot", "Place"],
  };
  for (const [slug, [facilityType, schemaType]] of Object.entries(expectedTypes)) {
    clearMemoizedQueries();
    assert.equal(facilitySearchConfigs[slug].facilityType, facilityType, `${slug} still maps to ${facilityType}`);
    const calls = [];
    const deps = {
      searchEvents: async () => [],
      searchFacilities: async (query) => {
        calls.push(query);
        return [makeFacility({ service_item: slug === "pharmacies" ? "健保特約藥局" : "醫學中心" })];
      },
      now: () => NOW,
    };
    const list = await loaderModule.loadToolPageSupplementJsonLd({ slug, title: `${slug} title`, description: "desc", deps });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].facilityType, facilityType);
    for (const key of ["lat", "lng", "keyword", "county", "district", "radiusMeters"]) {
      assert.ok(!(key in calls[0]), `the sample query must not carry ${key} (no per-user location)`);
    }
    assert.equal(list["@type"], "ItemList");
    assert.equal(list["@id"], `${BASE}/tools/${slug}#facilities`);
    assert.equal(list.name, `${slug} title`);
    assert.equal(list.description, "desc");
    assert.equal(list.itemListElement[0].item["@type"], schemaType);
  }
});

test("loader: a failing, hanging or empty data source just means no extra node", async () => {
  clearMemoizedQueries();
  const boom = await loaderModule.loadToolPageSupplementJsonLd({
    slug: "pharmacies",
    title: "藥局",
    deps: { searchFacilities: async () => { throw new Error("db down"); } },
  });
  assert.equal(boom, null);

  clearMemoizedQueries();
  const hang = await loaderModule.loadToolPageSupplementJsonLd({
    slug: "clinics",
    title: "診所",
    timeoutMs: 25,
    deps: { searchFacilities: () => new Promise(() => {}) },
  });
  assert.equal(hang, null);

  clearMemoizedQueries();
  const empty = await loaderModule.loadToolPageSupplementJsonLd({
    slug: "aed",
    title: "AED",
    deps: { searchFacilities: async () => [makeFacility({ lat: null, lng: null })] },
  });
  assert.equal(empty, null);
});

test("loader: a transient failure is not cached — the next call retries", async () => {
  clearMemoizedQueries();
  let calls = 0;
  const deps = {
    searchFacilities: async () => {
      calls += 1;
      if (calls === 1) throw new Error("first call fails");
      return [makeFacility({ service_item: "健保特約藥局" })];
    },
  };
  assert.equal(await loaderModule.loadToolPageSupplementJsonLd({ slug: "pharmacies", title: "藥局", deps }), null);
  const second = await loaderModule.loadToolPageSupplementJsonLd({ slug: "pharmacies", title: "藥局", deps });
  assert.equal(second["@type"], "ItemList");
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------------
// Source-level wiring (JSX files can't be imported by `node --test`)
// ---------------------------------------------------------------------------

test("ToolPageShell renders the supplement graph via serializeJsonLd and builds the tool graph with the page locale", () => {
  const src = read("components", "Tools", "ToolPageShell.tsx");
  assert.ok(src.includes("loadToolPageSupplementJsonLd"), "ToolPageShell loads the supplement node");
  assert.ok(
    /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML=\{\{ __html: serializeJsonLd\(supplementGraph\) \}\}/.test(src),
    "the supplement script is serialized with the `<`-escaping helper",
  );
  assert.ok(/buildToolGraphJsonLd\(localizedCatalogEntry, localizedMeta \? \{ locale \} : \{\}\)/.test(src), "the locale only reaches the graph when the entry is actually translated");
  assert.ok(/locale: localizedMeta \? locale : "zh-TW"/.test(src), "an untranslated body never claims a foreign locale for the supplement node");
});

test("cultural-events and every facility-list tool render through ToolPageShell in zh and (where translated) /en /ja /ko", () => {
  const slugs = ["cultural-events", ...loaderModule.FACILITY_LIST_JSONLD_SLUGS];
  for (const slug of slugs) {
    const zh = read("app", "(zh)", "tools", slug, "page.tsx");
    assert.ok(zh.includes(`<ToolPageShell`) && zh.includes(`slug="${slug}"`), `zh /tools/${slug} uses ToolPageShell`);
    assert.ok(translatedPages.isTranslatedToolSlug(slug), `${slug} has /en /ja /ko pages`);
    const localized = read("app", "[locale]", "tools", slug, "page.tsx");
    assert.ok(localized.includes(`<ToolPageShell`) && localized.includes(`slug="${slug}"`) && localized.includes("locale={locale}"), `/{locale}/tools/${slug} passes its locale to ToolPageShell`);
  }
});

test("the supplement loader and builders never touch request/geolocation state", () => {
  for (const file of ["toolPageStructuredData.ts", "structuredData.ts", "nearbyJsonLd.ts", "pageLocale.ts"]) {
    const src = read("lib", "server", "seo", file);
    for (const forbidden of ["searchParams", "navigator.", "getCurrentPosition", "useSharedGeolocation", "headers(", "cookies("]) {
      assert.ok(!src.includes(forbidden), `${file} must not reference ${forbidden}`);
    }
  }
});

test("every new JSON-LD <script> in pages goes through serializeJsonLd", () => {
  const files = [
    ["app", "(zh)", "nearby", "page.tsx"],
    ["app", "[locale]", "nearby", "page.tsx"],
    ["app", "[locale]", "tools", "global-watch", "earthquakes", "page.tsx"],
    ["app", "[locale]", "tools", "global-watch", "typhoons", "page.tsx"],
  ];
  for (const parts of files) {
    const src = read(...parts);
    assert.ok(src.includes("serializeJsonLd("), `${parts.join("/")} serializes its new JSON-LD with serializeJsonLd`);
    for (const match of src.matchAll(/dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify\((\w+)\) \}\}/g)) {
      assert.equal(match[1], "breadcrumb", `${parts.join("/")}: only the pre-existing BreadcrumbList may use bare JSON.stringify`);
    }
  }
});

test("the localized pages pass their locale into the JSON-LD builders", () => {
  const home = read("app", "[locale]", "page.tsx");
  assert.ok(/buildHomeGraphJsonLd\(items, \{[\s\S]*?locale,[\s\S]*?canonicalPath: CANONICAL_PATH,/.test(home));
  const guide = read("app", "[locale]", "guides", "typhoon-earthquake", "page.tsx");
  assert.ok(guide.includes("buildGuideGraphJsonLd(localizedGuideForGraph, { locale })"));
  for (const item of ["earthquakes", "typhoons"]) {
    const src = read("app", "[locale]", "tools", "global-watch", item, "page.tsx");
    assert.ok(src.includes("buildLocalizedWebPageJsonLd("), `${item} emits a localized WebPage node`);
    assert.ok(/canonicalPath: CANONICAL_PATH \},\s*\{ locale \}/.test(src), `${item} passes its locale`);
  }
  const nearbyLocale = read("app", "[locale]", "nearby", "page.tsx");
  assert.ok(nearbyLocale.includes("buildNearbyJsonLdEntries(baseUrl, locale)") && nearbyLocale.includes("{ locale }"));
  const nearbyZh = read("app", "(zh)", "nearby", "page.tsx");
  assert.ok(nearbyZh.includes("buildNearbyJsonLdEntries(baseUrl)"));
});
