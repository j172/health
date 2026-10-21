/**
 * The request sequence used by every measured variant (issue #709).
 *
 * ~50 GET paths, picked from app/ and the sitemap: home, news (list + one
 * article id; without a database the article is expected to 404/degrade),
 * the first 20 tool pages, the first 15 public JSON APIs, and /en /ja /ko.
 * Admin routes are deliberately excluded (auth + they would trigger syncs).
 *
 * Nothing here depends on a database: where a route needs one it degrades to
 * its seed/fallback path (or an error status), and the status is recorded.
 */

export const PAGE_ROUTES = [
  "/",
  "/news",
  "/news/1",
  "/tools",
  "/nearby",
  "/guides/typhoon-earthquake",
  "/privacy",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/feed.xml",
  "/emergency",
];

export const TOOL_ROUTES = [
  "/tools/accessible-parking",
  "/tools/accessible-transit",
  "/tools/adult-preventive-care",
  "/tools/aed",
  "/tools/anti-fraud",
  "/tools/aqi",
  "/tools/aqx-monitoring",
  "/tools/audible-signals",
  "/tools/baby-friendly-hospitals",
  "/tools/blood-pressure",
  "/tools/bmi",
  "/tools/body-fat",
  "/tools/bookstores",
  "/tools/breastfeeding-rooms",
  "/tools/calories",
  "/tools/carbon-footprint",
  "/tools/child-native-languages",
  "/tools/child-safety-spots",
  "/tools/child-subsidies",
  "/tools/child-welfare-institutions",
];

export const API_ROUTES = [
  "/api/accessible-transit",
  "/api/alerts/active",
  "/api/aqi",
  "/api/aqx",
  "/api/books",
  "/api/breastfeeding-rooms",
  "/api/carbon-footprint-coefficients",
  "/api/carbon-footprint-products",
  "/api/cdc/travel-alerts",
  "/api/contraception-map",
  "/api/cpc-prices",
  "/api/cpc-stations",
  "/api/culture/public-art",
  "/api/culture/shows",
  "/api/disaster-map",
];

export const LOCALE_ROUTES = [
  "/en",
  "/ja",
  "/ko",
  "/en/tools/aed",
  "/ja/tools/aqi",
];

export const SWEEP_ROUTES = [...PAGE_ROUTES, ...TOOL_ROUTES, ...API_ROUTES, ...LOCALE_ROUTES];

/**
 * Variant C probes: one request per large bundled seed, in this order, so the
 * memory delta of each can be read off separately. `note` names the file the
 * route pulls in.
 */
export const SEED_PROBES = [
  { name: "breastfeeding-rooms", path: "/api/breastfeeding-rooms", note: "data/breastfeeding-rooms-seed.json (1.6 MB, static import in route)" },
  { name: "heritage-map", path: "/api/heritage-map", note: "data/heritage-map-seed.json (1.5 MB, static import + fs read)" },
  { name: "public-art", path: "/api/culture/public-art", note: "data/public-art.json (6.8 MB, fs read at request time)" },
  { name: "cultural-events", path: "/api/culture/shows", note: "data/cultural-events-seed.json (3.0 MB, fs read at request time)" },
  { name: "cultural-events-page", path: "/tools/cultural-events", note: "cultural-events page (SSR/ISR path)" },
  { name: "child-native-languages-twblg", path: "/api/tools/child-native-languages?lang=twblg", note: "data/child-native-languages-seed.json (30 MB, static import in lib/server/dictionary/service.ts)" },
  { name: "child-native-languages-hakka", path: "/api/tools/child-native-languages?lang=hakka", note: "second language of the same seed (should add ~0)" },
  { name: "facilities-aed", path: "/api/facilities?type=aed", note: "route statically imports 6 seed files" },
];
