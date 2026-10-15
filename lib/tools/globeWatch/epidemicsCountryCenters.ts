/**
 * Issue #597 (parent #583) — ISO 3166-1 alpha-2 → country-center-point
 * coordinates, for placing a WHO Disease Outbreak News (DON) pin on a
 * country when the globe has no per-article coordinate to plot (WHO's API
 * only ever gives a free-text country name — see
 * lib/server/who/sources/who.ts's parseWhoDonTitle — never a lat/lng).
 *
 * This is a small, closed, hand-checked data module (approximate
 * geographic/visual center of each country, not a precise population- or
 * area-weighted centroid — "good enough to place one pin inside the
 * country's own territory," the same bar lib/tools/globeWatch/
 * epidemicsCountryNames.ts's dictionary sets for its own hand-checked
 * values), kept independently testable (no DB, no DOM, no MapLibre import —
 * same contract as every other lib/tools/globeWatch/* pure module).
 *
 * Coverage: every ISO code `resolveCountryIsoFromName` in
 * lib/server/who/countryIso.ts can ever return — i.e. every key in
 * EPIDEMIC_COUNTRY_NAMES (lib/tools/globeWatch/epidemicsCountryNames.ts,
 * which #597 extended with CZ/IR/KP/MD/SY/TZ precisely so a single table
 * covers this too) plus RESOLVABLE_COUNTRY_ISO_CODES' own set — asserted by
 * this module's test (tests/global-watch-597-who-pins.test.mjs), not just
 * assumed. A WHO DON row whose resolved ISO somehow isn't in this table is
 * never guessed a coordinate — `resolveCountryCenter` returns `null` and the
 * caller (lib/tools/globeWatch/whoDonTransform.ts's buildWhoDonPinFeatures)
 * drops that row from the pin layer rather than plotting it anywhere wrong.
 */

export interface CountryCenterPoint {
  lat: number;
  lng: number;
}

export const EPIDEMIC_COUNTRY_CENTERS: Record<string, CountryCenterPoint> = {
  AF: { lat: 33.9, lng: 67.7 },
  AO: { lat: -11.2, lng: 17.9 },
  AR: { lat: -38.4, lng: -63.6 },
  AU: { lat: -25.3, lng: 133.8 },
  AZ: { lat: 40.1, lng: 47.6 },
  BD: { lat: 23.7, lng: 90.4 },
  BI: { lat: -3.4, lng: 29.9 },
  BO: { lat: -16.3, lng: -63.6 },
  BR: { lat: -14.2, lng: -51.9 },
  CA: { lat: 56.1, lng: -106.3 },
  CD: { lat: -4.0, lng: 21.8 },
  CF: { lat: 6.6, lng: 20.9 },
  CH: { lat: 46.8, lng: 8.2 },
  CL: { lat: -35.7, lng: -71.5 },
  CM: { lat: 7.4, lng: 12.4 },
  CN: { lat: 35.9, lng: 104.2 },
  CO: { lat: 4.6, lng: -74.3 },
  CR: { lat: 9.7, lng: -83.8 },
  CU: { lat: 21.5, lng: -77.8 },
  CZ: { lat: 49.8, lng: 15.5 },
  DO: { lat: 18.7, lng: -70.2 },
  DZ: { lat: 28.0, lng: 1.7 },
  EC: { lat: -1.8, lng: -78.2 },
  ES: { lat: 40.5, lng: -3.7 },
  ET: { lat: 9.1, lng: 40.5 },
  FR: { lat: 46.2, lng: 2.2 },
  GB: { lat: 55.4, lng: -3.4 },
  GF: { lat: 3.9, lng: -53.1 },
  GH: { lat: 7.9, lng: -1.0 },
  GN: { lat: 9.9, lng: -9.7 },
  GR: { lat: 39.1, lng: 21.8 },
  GT: { lat: 15.8, lng: -90.2 },
  GW: { lat: 11.8, lng: -15.2 },
  HK: { lat: 22.3, lng: 114.2 },
  HT: { lat: 18.9, lng: -72.3 },
  ID: { lat: -0.8, lng: 113.9 },
  IL: { lat: 31.0, lng: 34.8 },
  IN: { lat: 20.6, lng: 78.9 },
  IR: { lat: 32.4, lng: 53.7 },
  IT: { lat: 41.9, lng: 12.6 },
  JO: { lat: 31.0, lng: 36.2 },
  JP: { lat: 36.2, lng: 138.3 },
  KE: { lat: -0.0, lng: 37.9 },
  KH: { lat: 12.6, lng: 104.9 },
  KI: { lat: 1.9, lng: -157.4 },
  KP: { lat: 40.3, lng: 127.5 },
  KR: { lat: 35.9, lng: 127.8 },
  KZ: { lat: 48.0, lng: 66.9 },
  LA: { lat: 19.9, lng: 102.5 },
  LK: { lat: 7.9, lng: 80.8 },
  LR: { lat: 6.4, lng: -9.4 },
  LT: { lat: 55.2, lng: 23.9 },
  MD: { lat: 47.4, lng: 28.4 },
  MG: { lat: -18.8, lng: 47.0 },
  ML: { lat: 17.6, lng: -4.0 },
  MM: { lat: 21.9, lng: 95.9 },
  MR: { lat: 21.0, lng: -10.9 },
  MV: { lat: 3.2, lng: 73.2 },
  MW: { lat: -13.3, lng: 34.3 },
  MX: { lat: 23.6, lng: -102.5 },
  MY: { lat: 4.2, lng: 101.9 },
  NA: { lat: -22.9, lng: 18.5 },
  NE: { lat: 17.6, lng: 8.1 },
  NG: { lat: 9.1, lng: 8.7 },
  NP: { lat: 28.4, lng: 84.1 },
  PE: { lat: -9.2, lng: -75.0 },
  PG: { lat: -6.3, lng: 143.9 },
  PH: { lat: 12.9, lng: 121.8 },
  PK: { lat: 30.4, lng: 69.3 },
  PT: { lat: 39.4, lng: -8.2 },
  PY: { lat: -23.4, lng: -58.4 },
  RE: { lat: -21.1, lng: 55.5 },
  RS: { lat: 44.0, lng: 21.0 },
  RU: { lat: 61.5, lng: 105.3 },
  SC: { lat: -4.7, lng: 55.5 },
  SD: { lat: 12.9, lng: 30.2 },
  SE: { lat: 60.1, lng: 18.6 },
  SG: { lat: 1.35, lng: 103.8 },
  SN: { lat: 14.5, lng: -14.5 },
  SO: { lat: 5.2, lng: 46.2 },
  SS: { lat: 7.3, lng: 30.0 },
  SY: { lat: 34.8, lng: 38.9 },
  TD: { lat: 15.5, lng: 18.7 },
  TH: { lat: 15.9, lng: 100.9 },
  TR: { lat: 38.96, lng: 35.24 },
  TW: { lat: 23.7, lng: 121.0 },
  TZ: { lat: -6.4, lng: 34.9 },
  UA: { lat: 48.4, lng: 31.2 },
  UG: { lat: 1.4, lng: 32.3 },
  US: { lat: 37.1, lng: -95.7 },
  VE: { lat: 6.4, lng: -66.6 },
  VN: { lat: 14.1, lng: 108.3 },
  YE: { lat: 15.6, lng: 48.5 },
  YT: { lat: -12.8, lng: 45.2 },
  ZA: { lat: -30.6, lng: 22.9 },
  ZM: { lat: -13.1, lng: 27.9 },
};

/**
 * Resolves `iso`'s country-center point, or `null` when `iso` isn't in
 * `EPIDEMIC_COUNTRY_CENTERS` (unlisted/unknown/empty code) — never a guessed
 * coordinate (same "查不到時…不猜測" contract every other globe-watch
 * dictionary in this codebase follows).
 */
export function resolveCountryCenter(iso: string | null | undefined): CountryCenterPoint | null {
  const code = (iso ?? "").trim().toUpperCase();
  if (!code) return null;
  return EPIDEMIC_COUNTRY_CENTERS[code] ?? null;
}
