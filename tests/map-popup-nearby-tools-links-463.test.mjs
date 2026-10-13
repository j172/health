import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// issue #463: every Leaflet map popup across the site gets a shared
// "看附近的 AED／急診／藥局" deep-link block (components/Map/PopupNearbyToolsLinks.tsx),
// and the 3 target tool pages (aed, er-status, pharmacies) learn to read an
// incoming `?lat=&lng=` override and center/sort their results on it instead
// of the browser's own geolocation, falling back to the pre-existing
// geolocation-first behavior when the params are absent.
//
// Same registerHooks pattern as tests/outboundLinkUtm.test.mjs /
// tests/issue-418-map-navigation-i18n-isr.test.mjs: plain `node --test` has
// no TS/path-alias loader wired up, so `@/` specifiers and extension-less
// relative specifiers need a resolve hook before the real source files can
// be imported directly.
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
});

const {
  isValidGeolocationOverride,
  parseGeolocationOverrideFromSearchParams,
  parseGeolocationOverrideFromPlainParams,
} = await import("../lib/utils/geolocationOverride.ts");

function read(relPath) {
  return fs.readFileSync(new URL(relPath, REPO_ROOT), "utf8");
}

// ---------------------------------------------------------------------------
// Real behavior tests for the shared override-parsing helpers. These are the
// exact functions components/Facilities/useGeolocation.ts's `override`
// parameter relies on (via isValidGeolocationOverride) and that
// AedContent.tsx / app/tools/pharmacies/page.tsx / app/tools/er-status/page.tsx
// call to turn an incoming request into that parameter — not a
// reimplementation, the real shipped module.
// ---------------------------------------------------------------------------

test("isValidGeolocationOverride: accepts finite coordinate pairs, rejects everything else", () => {
  assert.equal(isValidGeolocationOverride({ lat: 25.033, lng: 121.5654 }), true);
  assert.equal(isValidGeolocationOverride({ lat: -89.9, lng: -179.9 }), true);
  assert.equal(isValidGeolocationOverride(null), false);
  assert.equal(isValidGeolocationOverride(undefined), false);
  assert.equal(isValidGeolocationOverride({ lat: NaN, lng: 121.5654 }), false);
  assert.equal(isValidGeolocationOverride({ lat: 25.033, lng: Infinity }), false);
});

test("parseGeolocationOverrideFromSearchParams: valid ?lat=&lng= on a URLSearchParams-like object", () => {
  const params = new URLSearchParams("lat=25.047&lng=121.517");
  assert.deepEqual(parseGeolocationOverrideFromSearchParams(params), { lat: 25.047, lng: 121.517 });
});

test("parseGeolocationOverrideFromSearchParams: CRITICAL fallback — returns null when params are absent, malformed, or non-numeric (must fall back to normal browser geolocation, not crash or silently zero out coordinates)", () => {
  // No params at all — the overwhelmingly common case: a user who arrives at
  // /tools/aed, /tools/er-status or /tools/pharmacies directly, not via a map
  // popup's deep link. A regression here would silently break geolocation
  // for every one of those visitors.
  assert.equal(parseGeolocationOverrideFromSearchParams(new URLSearchParams("")), null);
  assert.equal(parseGeolocationOverrideFromSearchParams(null), null);
  assert.equal(parseGeolocationOverrideFromSearchParams(undefined), null);
  // Only one of the two params present
  assert.equal(parseGeolocationOverrideFromSearchParams(new URLSearchParams("lat=25.0")), null);
  assert.equal(parseGeolocationOverrideFromSearchParams(new URLSearchParams("lng=121.0")), null);
  // Non-numeric / malformed values
  assert.equal(parseGeolocationOverrideFromSearchParams(new URLSearchParams("lat=abc&lng=121.0")), null);
  assert.equal(parseGeolocationOverrideFromSearchParams(new URLSearchParams("lat=&lng=")), null);
});

test("parseGeolocationOverrideFromPlainParams: server-side (Next.js awaited searchParams) — valid, repeated-param, and absent cases", () => {
  assert.deepEqual(parseGeolocationOverrideFromPlainParams({ lat: "25.047", lng: "121.517" }), {
    lat: 25.047,
    lng: 121.517,
  });
  // A repeated query param (?lat=1&lat=2) arrives as a string[] — takes the first.
  assert.deepEqual(parseGeolocationOverrideFromPlainParams({ lat: ["25.0", "99.0"], lng: ["121.0"] }), {
    lat: 25.0,
    lng: 121.0,
  });
  // Fallback cases, mirroring the client-side test above.
  assert.equal(parseGeolocationOverrideFromPlainParams({}), null);
  assert.equal(parseGeolocationOverrideFromPlainParams(null), null);
  assert.equal(parseGeolocationOverrideFromPlainParams(undefined), null);
  assert.equal(parseGeolocationOverrideFromPlainParams({ lat: "25.0" }), null);
  assert.equal(parseGeolocationOverrideFromPlainParams({ lat: "nope", lng: "121.0" }), null);
});

// ---------------------------------------------------------------------------
// useGeolocation.ts wiring: confirm the hook actually uses these helpers to
// (a) seed its initial state from the override when valid, and (b) skip the
// browser-geolocation effect entirely in that case, while preserving the
// exact pre-existing behavior (browser geolocation → saved location →
// GEO_DEFAULTS) whenever no override is supplied. We can't render the hook
// here (no DOM/React renderer wired into plain `node --test`, same
// constraint documented in tests/useSharedGeolocation.test.mjs), so this is
// a source-text integration check against the shipped file.
// ---------------------------------------------------------------------------

test("useGeolocation.ts: override parameter seeds initial state and short-circuits the browser-geolocation effect", () => {
  const src = read("components/Facilities/useGeolocation.ts");

  assert.match(src, /import\s*\{[^}]*isValidGeolocationOverride[^}]*\}\s*from\s*["']@\/lib\/utils\/geolocationOverride["']/s);
  assert.match(src, /export function useGeolocation\(override\?:\s*GeolocationOverride \| null\)/);
  assert.match(src, /const hasOverride = isValidGeolocationOverride\(override\);/);
  // Initial useState branches on hasOverride: override coordinates, isDefault
  // false, loading false (no spinner, no permission prompt) when present.
  assert.match(src, /hasOverride\s*\n\s*\?\s*\{\s*\n\s*lat:\s*override!\.lat,\s*\n\s*lng:\s*override!\.lng,\s*\n\s*isDefault:\s*false,\s*\n\s*loading:\s*false,/);
  // The mount effect must bail out before calling locate()/getSavedLocation() when hasOverride.
  assert.match(src, /if \(hasOverride\) return;[\s\S]{0,400}locate\(300_000, "initial"\);/);
  // refresh() must NOT be short-circuited by override — a user can still manually re-locate.
  const refreshFn = src.slice(src.indexOf("const refresh = useCallback"));
  assert.match(refreshFn, /locate\(0, "refresh"\);/);
});

test("useGeolocation.ts: re-exports the override type + client-side parser for existing call sites", () => {
  const src = read("components/Facilities/useGeolocation.ts");
  assert.match(src, /export type \{ GeolocationOverride \};/);
  assert.match(src, /export \{ parseGeolocationOverrideFromSearchParams \};/);
});

// ---------------------------------------------------------------------------
// The 3 target tool pages/components actually thread the override through.
// ---------------------------------------------------------------------------

test("AedContent.tsx: reads ?lat=&lng= via useSearchParams and passes it into useLocationWithManualFallback (issue #478: migrated off the old per-call-site useGeolocation hook onto the shared one, which still skips browser geolocation entirely when a valid override is present)", () => {
  const src = read("components/Tools/AedContent.tsx");
  assert.match(src, /import\s*\{\s*useSearchParams\s*\}\s*from\s*["']next\/navigation["']/);
  assert.match(src, /parseGeolocationOverrideFromSearchParams\(searchParams\)/);
  assert.match(src, /useLocationWithManualFallback\(locationOverride\)/);
});

test("app/tools/aed/page.tsx: wraps AedContent in a Suspense boundary (required by useSearchParams in the App Router)", () => {
  const src = read("app/tools/aed/page.tsx");
  assert.match(src, /import\s*\{\s*Suspense\s*\}\s*from\s*["']react["']/);
  assert.match(src, /<Suspense>\s*\n\s*<AedContent \/>\s*\n\s*<\/Suspense>/);
});

test("FacilitySearchContent.tsx: accepts a locationOverride prop and uses it to skip the shared geolocation hook's browser-geolocation effect entirely (issue #478: migrated off the old per-call-site useGeolocation hook; no useSearchParams() of its own — shared by 30+ unrelated /tools pages)", () => {
  const src = read("components/Facilities/FacilitySearchContent.tsx");
  assert.doesNotMatch(src, /from ["']next\/navigation["']/);
  assert.match(src, /locationOverride\s*=\s*null,?\s*\n\}:\s*\{/);
  assert.match(src, /locationOverride\?:\s*GeolocationOverride \| null;/);
  assert.match(src, /const hasOverride = isValidGeolocationOverride\(locationOverride\);/);
  assert.match(src, /useSharedGeolocation\(\{\s*skip:\s*hasOverride\s*\}\)/);
});

test("app/tools/pharmacies/page.tsx: server component resolves ?lat=&lng= from its own searchParams prop and forwards it", () => {
  const src = read("app/tools/pharmacies/page.tsx");
  assert.match(src, /searchParams:\s*Promise<\{\s*lat\?:\s*string;\s*lng\?:\s*string\s*\}>/);
  assert.match(src, /parseGeolocationOverrideFromPlainParams\(await searchParams\)/);
  assert.match(src, /<FacilitySearchContent[^>]*locationOverride=\{locationOverride\}/);
});

test("EmergencyRoomContent.tsx: reads ?lat=&lng= via useSearchParams (not a prop from the server page) and includes it when refetching /api/emergency-rooms", () => {
  const src = read("components/Tools/EmergencyRoomContent.tsx");
  // Reads the override itself, client-side — same pattern as AedContent.tsx,
  // and deliberately NOT a prop resolved by app/tools/er-status/page.tsx from
  // its own `searchParams`: reading `searchParams` in that server page would
  // opt the whole route out of static rendering/ISR (a Next.js Dynamic API),
  // turning its 30-second-shared getEmergencyRoomOverview() query into one
  // DB hit per request for every visitor, not just the few arriving via a
  // map popup's deep link.
  assert.match(src, /import\s*\{\s*useSearchParams\s*\}\s*from\s*["']next\/navigation["']/);
  assert.match(src, /parseGeolocationOverrideFromSearchParams\(searchParams\)/);
  assert.doesNotMatch(src, /locationOverride\?:\s*GeolocationOverride \| null;/, "must not re-accept this as a prop");
  assert.match(src, /query\.set\("lat",\s*String\(locationOverride\.lat\)\)/);
  assert.match(src, /query\.set\("lng",\s*String\(locationOverride\.lng\)\)/);
  assert.match(src, /fetch\(`\/api\/emergency-rooms\$\{qs \? `\?\$\{qs\}` : ""\}`\)/);
  // A deep-link visit must trigger a fresh, distance-sorted client fetch
  // rather than trusting the SSR initialData (which isn't sorted by it).
  assert.match(src, /if \(locationOverride\) \{\s*\n\s*refreshData\(\);/);
});

test("app/tools/er-status/page.tsx: does NOT read searchParams server-side (preserves the 30s ISR cache for the general-visitor case) and wraps EmergencyRoomContent in Suspense", () => {
  const src = read("app/tools/er-status/page.tsx");
  assert.doesNotMatch(
    src,
    /searchParams\s*[:,)]|await\s+searchParams/,
    "must not accept/read a searchParams prop — would force this ISR page fully dynamic for every visitor",
  );
  assert.match(src, /import\s*\{\s*Suspense\s*\}\s*from\s*["']react["']/);
  assert.match(src, /<Suspense>\s*\n\s*<EmergencyRoomContent initialData=\{initialData\} \/>\s*\n\s*<\/Suspense>/);
  assert.match(src, /getEmergencyRoomOverview\(\);/);
});

// ---------------------------------------------------------------------------
// PopupNearbyToolsLinks itself: the 3 deep-links point at the right tool
// pages and are templated off whatever coordinates it's given — not a
// hardcoded value — and it degrades to rendering nothing for bad input.
// ---------------------------------------------------------------------------

test("PopupNearbyToolsLinks.tsx: renders exactly the 3 target tool links, templated off its lat/lng props", () => {
  const src = read("components/Map/PopupNearbyToolsLinks.tsx");
  assert.match(src, /href:\s*"\/tools\/aed"/);
  assert.match(src, /href:\s*"\/tools\/er-status"/);
  assert.match(src, /href:\s*"\/tools\/pharmacies"/);
  assert.match(src, /const query = `\?lat=\$\{numLat\}&lng=\$\{numLng\}`;/);
  assert.match(src, /href=\{`\$\{tool\.href\}\$\{query\}`\}/);
  // Guards against bad input instead of emitting a broken link.
  assert.match(src, /if \(!Number\.isFinite\(numLat\) \|\| !Number\.isFinite\(numLng\)\) return null;/);
});

// ---------------------------------------------------------------------------
// Every surveyed Leaflet map popup component imports PopupNearbyToolsLinks
// and renders it inside each of its marker popups, wired to that marker's
// own coordinates (never a literal/hardcoded number).
// ---------------------------------------------------------------------------

const MAP_POPUP_SITES = [
  { file: "components/BreastfeedingRooms/BreastfeedingMapLeaflet.tsx", vars: ["p"] },
  { file: "components/ContraceptionMap/ContraceptionMapLeaflet.tsx", vars: ["p"] },
  {
    file: "components/DisasterMap/DisasterMapLeaflet.tsx",
    // 5 distinct marker layers in this one file: inundation sensors, dam
    // structures, groundwater stations, the capped shelter/rescue/eoc layer,
    // and debris-flow alert streams.
    vars: ["ip", "s", "s", "p", "df"],
  },
  { file: "components/HeritageMap/HeritageMapLeaflet.tsx", vars: ["p"] },
  { file: "components/Tools/AedMapLeaflet.tsx", vars: ["item/lat,lng"] },
  { file: "components/Tools/InundationMapLeaflet.tsx", vars: ["s", "sh"] },
  { file: "components/Facilities/FacilityMap.tsx", vars: ["m"] },
  { file: "components/Tools/CpcStationMap.tsx", vars: ["station"] },
  { file: "components/WaterOutages/WaterOutagesLeaflet.tsx", vars: ["o", "s"] },
];

test("every surveyed map file imports the shared PopupNearbyToolsLinks component", () => {
  for (const { file } of MAP_POPUP_SITES) {
    const src = read(file);
    assert.match(
      src,
      /import PopupNearbyToolsLinks from ["']@\/components\/Map\/PopupNearbyToolsLinks["'];/,
      `${file} should import the shared popup component`,
    );
  }
});

test("every surveyed map file renders <PopupNearbyToolsLinks lat=... lng=... /> once per marker popup, using that marker's own variable", () => {
  for (const { file, vars } of MAP_POPUP_SITES) {
    const src = read(file);
    const matches = [...src.matchAll(/<PopupNearbyToolsLinks lat=\{([^}]+)\} lng=\{([^}]+)\} \/>/g)];
    assert.equal(
      matches.length,
      vars.length,
      `${file} should render PopupNearbyToolsLinks exactly ${vars.length} time(s) (one per marker-popup type), found ${matches.length}`,
    );
    for (const [, latExpr, lngExpr] of matches) {
      const lat = latExpr.trim();
      const lng = lngExpr.trim();
      // Not a hardcoded literal coordinate (a bare number).
      assert.ok(!/^-?\d/.test(lat), `${file}: lat expression "${lat}" looks hardcoded, not templated`);
      assert.ok(!/^-?\d/.test(lng), `${file}: lng expression "${lng}" looks hardcoded, not templated`);
      // When dotted (e.g. "p.lat" / "p.lng"), both should hang off the same
      // object. Bare identifiers (e.g. AedMapLeaflet's locally-destructured
      // "lat" / "lng") have no object to compare, so they trivially pass.
      if (lat.includes(".") || lng.includes(".")) {
        const latBase = lat.replace(/\.lat$/, "");
        const lngBase = lng.replace(/\.lng$/, "");
        assert.equal(latBase, lngBase, `${file}: lat/lng expressions "${lat}" / "${lng}" should come from the same marker variable`);
      }
    }
  }
});

// The user-location marker's own popup should NOT get this block — it would be
// a redundant "see things near where I'm currently centering the map on myself"
// link. Since issue #476, every one of the 9 map pages renders its user-location
// marker through the single shared components/Map/BaseMap.tsx instead of each
// duplicating its own (FacilityMap.tsx no longer renders a user-location <Marker>
// at all — it hands `userLocation` to BaseMap, which owns this marker now), so
// checking BaseMap.tsx once covers all 9 call sites.
test("the user-location marker's own popup is not given nearby-tools links (would be redundant)", () => {
  const baseMapSrc = read("components/Map/BaseMap.tsx");
  const userLocationPopup = baseMapSrc.match(
    /<Marker position=\{\[userLocation\.lat, userLocation\.lng\]\} icon=\{userLocationIcon\}>[\s\S]*?<\/Marker>/,
  )[0];
  assert.doesNotMatch(userLocationPopup, /PopupNearbyToolsLinks/);
});
