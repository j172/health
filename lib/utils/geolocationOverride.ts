// Pure, framework-agnostic helpers for issue #463's "?lat=&lng=" deep-link
// override (the "看附近的 AED／急診／藥局" links added to every Leaflet map
// popup — see components/Map/PopupNearbyToolsLinks.tsx). Needed by BOTH:
//   - client components (components/Tools/AedContent.tsx,
//     components/Facilities/FacilitySearchContent.tsx), via
//     components/Facilities/useGeolocation.ts's `override` parameter, and
//   - server components (app/tools/pharmacies/page.tsx,
//     app/tools/er-status/page.tsx), which read Next's awaited `searchParams`
//     directly — a plain object, not a `URLSearchParams`-like value.
//
// This logic intentionally does NOT live inside useGeolocation.ts, which has
// a top-of-file "use client" directive: Next's RSC compiler treats every
// export of a "use client" module as a client reference when a Server
// Component imports it, so a Server Component page.tsx could not actually
// *call* a parsing function defined there, even though the function itself
// is plain, non-hook code with no browser API dependency.

export interface GeolocationOverride {
  lat: number;
  lng: number;
}

/** True when `override` carries two finite coordinates (not null/undefined/NaN/Infinity). */
export function isValidGeolocationOverride(
  override?: GeolocationOverride | null,
): override is GeolocationOverride {
  return override != null && Number.isFinite(override.lat) && Number.isFinite(override.lng);
}

function parseLatLngStrings(
  latStr: string | null | undefined,
  lngStr: string | null | undefined,
): GeolocationOverride | null {
  // Empty strings (e.g. a literal `?lat=&lng=`, which a template could emit
  // for a marker missing coordinates) must NOT fall through to `Number("")`
  // — that coerces to `0`, which is a real place (the Gulf of Guinea), not
  // "no override". Treat it the same as the param being absent entirely.
  if (latStr == null || lngStr == null || latStr === "" || lngStr === "") return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Client-side parsing: accepts anything with a `.get(key)` method, so this
 * works directly with Next's `useSearchParams()` result (a
 * `ReadonlyURLSearchParams`) or a plain `URLSearchParams`. Returns `null`
 * when either parameter is missing or not a finite number — callers should
 * treat `null` as "no override", falling back to normal browser geolocation.
 */
export function parseGeolocationOverrideFromSearchParams(
  searchParams: { get(key: string): string | null } | null | undefined,
): GeolocationOverride | null {
  if (!searchParams) return null;
  return parseLatLngStrings(searchParams.get("lat"), searchParams.get("lng"));
}

/**
 * Server-side parsing: for a Next.js page's awaited `searchParams` prop,
 * which is a plain `{ [key: string]: string | string[] | undefined }`
 * object (a param repeated in the URL arrives as a string array; this takes
 * the first occurrence). Same `null`-means-"no override" contract as
 * `parseGeolocationOverrideFromSearchParams` above.
 */
export function parseGeolocationOverrideFromPlainParams(
  searchParams: Record<string, string | string[] | undefined> | null | undefined,
): GeolocationOverride | null {
  if (!searchParams) return null;
  const rawLat = searchParams.lat;
  const rawLng = searchParams.lng;
  return parseLatLngStrings(
    Array.isArray(rawLat) ? rawLat[0] : rawLat,
    Array.isArray(rawLng) ? rawLng[0] : rawLng,
  );
}
