import { resolveCountyByPoint } from "@/lib/server/facilities/countyGeo";

/**
 * Rough bounding boxes for Taiwan's 22 counties/cities — deliberately loose
 * (a few km of slack, not precise borders) since this is only used to catch
 * gross geocoding mismatches (e.g. an address genuinely in 臺中市 landing in
 * 臺北市 — confirmed live, e.g. 中山醫學大學附設醫院), not to validate exact
 * placement. Both 臺/台 spellings map to the same box.
 *
 * Kept deliberately loose for that use (`isWithinCountyBounds`, used by
 * `geocodeBatch.ts` / `autoGeocode.ts` / `policeStations5958.ts` as a sanity
 * check with slack, not a precise border test) — do NOT tighten these into
 * exact borders. `resolveNearestCounty` below used to be built on these too,
 * but no longer is: see `countyGeo.ts` for why (TL;DR: a loose box isn't
 * precise enough to tell visitors which county's weather alerts apply to
 * them).
 */
export interface CountyBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const BOUNDS: Record<string, CountyBounds> = {
  臺北市: { minLat: 24.95, maxLat: 25.22, minLng: 121.44, maxLng: 121.67 },
  新北市: { minLat: 24.6, maxLat: 25.32, minLng: 121.2, maxLng: 122.05 },
  基隆市: { minLat: 25.05, maxLat: 25.22, minLng: 121.6, maxLng: 121.82 },
  桃園市: { minLat: 24.7, maxLat: 25.1, minLng: 120.95, maxLng: 121.45 },
  新竹市: { minLat: 24.72, maxLat: 24.88, minLng: 120.9, maxLng: 121.05 },
  新竹縣: { minLat: 24.4, maxLat: 24.88, minLng: 120.85, maxLng: 121.25 },
  苗栗縣: { minLat: 24.3, maxLat: 24.78, minLng: 120.65, maxLng: 121.25 },
  臺中市: { minLat: 23.95, maxLat: 24.48, minLng: 120.5, maxLng: 121.1 },
  彰化縣: { minLat: 23.7, maxLat: 24.18, minLng: 120.3, maxLng: 120.68 },
  南投縣: { minLat: 23.3, maxLat: 24.18, minLng: 120.6, maxLng: 121.35 },
  雲林縣: { minLat: 23.5, maxLat: 23.88, minLng: 120.1, maxLng: 120.65 },
  嘉義市: { minLat: 23.42, maxLat: 23.53, minLng: 120.4, maxLng: 120.52 },
  嘉義縣: { minLat: 23.2, maxLat: 23.68, minLng: 120.05, maxLng: 120.75 },
  臺南市: { minLat: 22.8, maxLat: 23.43, minLng: 120.0, maxLng: 120.65 },
  高雄市: { minLat: 22.4, maxLat: 23.5, minLng: 120.05, maxLng: 121.0 },
  屏東縣: { minLat: 21.85, maxLat: 22.88, minLng: 120.3, maxLng: 120.95 },
  宜蘭縣: { minLat: 24.3, maxLat: 25.0, minLng: 121.3, maxLng: 122.0 },
  花蓮縣: { minLat: 22.9, maxLat: 24.5, minLng: 121.1, maxLng: 121.8 },
  臺東縣: { minLat: 21.95, maxLat: 23.4, minLng: 120.7, maxLng: 121.6 },
  澎湖縣: { minLat: 23.15, maxLat: 23.85, minLng: 119.25, maxLng: 119.8 },
  金門縣: { minLat: 24.3, maxLat: 24.6, minLng: 118.1, maxLng: 118.6 },
  連江縣: { minLat: 25.9, maxLat: 26.45, minLng: 119.85, maxLng: 120.6 },
};

// Accept the 台/臺 variant as an alias for every county whose official name uses 臺.
const ALIASES: Record<string, string> = {};
for (const name of Object.keys(BOUNDS)) {
  if (name.startsWith("臺")) ALIASES[`台${name.slice(1)}`] = name;
}

/** County-level cities (縣轄市) that indicate their respective county when county prefix is omitted in raw addresses. */
export const COUNTY_SEATS: Record<string, string> = {
  花蓮市: "花蓮縣",
  宜蘭市: "宜蘭縣",
  苗栗市: "苗栗縣",
  彰化市: "彰化縣",
  南投市: "南投縣",
  臺東市: "臺東縣",
  台東市: "臺東縣",
  屏東市: "屏東縣",
  馬公市: "澎湖縣",
  竹北市: "新竹縣",
  斗六市: "雲林縣",
  太保市: "嘉義縣",
  朴子市: "嘉義縣",
};

/** Finds which county (if any) an address names, checked at the start (or with leading postal code/spaces stripped). */
export function countyForAddress(address: string): string | null {
  if (!address) return null;
  // Strip leading digits (zip code like 423 or 970), brackets, full-width whitespace
  const clean = address.replace(/^[\d\s\(\)\[\]【】\u3000-]+/, "").trim();

  // 1. Direct startsWith check
  for (const name of Object.keys(BOUNDS)) {
    if (clean.startsWith(name)) return name;
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (clean.startsWith(alias)) return canonical;
  }
  for (const [seat, canonical] of Object.entries(COUNTY_SEATS)) {
    if (clean.startsWith(seat)) return canonical;
  }

  // 2. Loose contains check within the first 12 characters (e.g. "台灣花蓮縣...", "中區花蓮市...")
  const prefix = clean.slice(0, 12);
  for (const name of Object.keys(BOUNDS)) {
    if (prefix.includes(name)) return name;
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (prefix.includes(alias)) return canonical;
  }
  for (const [seat, canonical] of Object.entries(COUNTY_SEATS)) {
    if (prefix.includes(seat)) return canonical;
  }

  return null;
}

/** True if (lat, lng) falls within `county`'s (loose) bounding box. */
export function isWithinCountyBounds(county: string, lat: number, lng: number): boolean {
  const bounds = BOUNDS[county];
  if (!bounds) return true; // unknown county name — don't flag what we can't check
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

/**
 * Resolves a visitor's GPS coordinates to the county/city whose real administrative
 * boundary contains them, for county-level features (e.g. "此縣市目前有哪些特報") — an
 * exact point-in-polygon test against actual county borders (see `countyGeo.ts` and
 * `public/data/county-boundaries/ATTRIBUTION.md`), not an approximation.
 *
 * Returns `null` when the point isn't inside any of the 22 counties' boundaries (open
 * sea, an outlying area the simplified boundary doesn't quite reach, or a GPS fix
 * that's simply off the island). Callers must treat `null` as "cannot determine" and
 * show that honestly — never guess a nearby county.
 *
 * Used to be built on `BOUNDS` above: a point inside exactly one county's loose box was
 * that county, and otherwise (including a point inside *two* overlapping boxes) it fell
 * back to whichever box-center was nearest. That fallback is why a New Taipei City
 * visitor near — or anywhere inside the part of New Taipei that wraps around — Taipei
 * City could get misclassified as being in Taipei City: Taipei's bounding box sits
 * entirely inside New Taipei's (New Taipei geographically encircles Taipei), so e.g.
 * 新莊區 (genuinely New Taipei) fell inside both boxes, and Taipei's box-center happened
 * to be the nearer one. Confirmed live during an active typhoon warning — visitors in
 * those districts saw "no alerts" for a county that had none active, while their real
 * county (New Taipei) did.
 */
export function resolveNearestCounty(lat: number, lng: number): string | null {
  return resolveCountyByPoint(lat, lng);
}

