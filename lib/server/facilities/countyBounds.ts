/**
 * Rough bounding boxes for Taiwan's 22 counties/cities — deliberately loose
 * (a few km of slack, not precise borders) since this is only used to catch
 * gross geocoding mismatches (e.g. an address genuinely in 臺中市 landing in
 * 臺北市 — confirmed live, e.g. 中山醫學大學附設醫院), not to validate exact
 * placement. Both 臺/台 spellings map to the same box.
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

/** Finds which county (if any) an address names, checked at the very start (where these addresses consistently put it). */
export function countyForAddress(address: string): string | null {
  for (const name of Object.keys(BOUNDS)) {
    if (address.startsWith(name)) return name;
  }
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (address.startsWith(alias)) return canonical;
  }
  return null;
}

/** True if (lat, lng) falls within `county`'s (loose) bounding box. */
export function isWithinCountyBounds(county: string, lat: number, lng: number): boolean {
  const bounds = BOUNDS[county];
  if (!bounds) return true; // unknown county name — don't flag what we can't check
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}
