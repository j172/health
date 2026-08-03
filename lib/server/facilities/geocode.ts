import { httpGetText } from "@/lib/server/net/httpClient";
import { rateLimiter } from "@/lib/server/net/rateLimiter";

export interface LatLng {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Google Maps Geocoding — primary when configured. Most accurate of the three
// providers for Taiwan addresses (this is what actually fixes the wrong-city
// mismatches OpenCage/Nominatim occasionally produce); OpenCage/Nominatim
// remain as fallbacks for when no Google key is set or its quota is hit.
// ---------------------------------------------------------------------------
const throttleGoogle = rateLimiter(100);

const queryGoogle = async (query: string): Promise<LatLng | null> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  await throttleGoogle();

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}&region=tw&language=zh-TW&components=country:TW`;
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) {
    console.error(`geocodeAddress: Google HTTP ${status} for "${query}"`);
    return null;
  }

  const data: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] } = JSON.parse(text);
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.error(`geocodeAddress: Google status ${data.status} for "${query}"`);
    return null;
  }

  const first = data.results?.[0];
  return first ? { lat: first.geometry.location.lat, lng: first.geometry.location.lng } : null;
};

// ---------------------------------------------------------------------------
// OpenCage — secondary. Own 2,500/day quota, independent of Nominatim's shared
// public pool, so trying this before Nominatim spares it for the overflow.
// ---------------------------------------------------------------------------
const throttleOpenCage = rateLimiter(1000);

const queryOpenCage = async (query: string): Promise<LatLng | null> => {
  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) return null;

  await throttleOpenCage();

  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${apiKey}&countrycode=tw&limit=1&no_annotations=1`;
  const { status, text } = await httpGetText(url);
  if (status === 402 || status === 429) {
    console.error(`geocodeAddress: OpenCage quota/rate exceeded (HTTP ${status})`);
    return null;
  }
  if (status < 200 || status >= 300) {
    console.error(`geocodeAddress: OpenCage HTTP ${status} for "${query}"`);
    return null;
  }

  const data: { results: { geometry: { lat: number; lng: number } }[] } = JSON.parse(text);
  const first = data.results?.[0];
  return first ? { lat: first.geometry.lat, lng: first.geometry.lng } : null;
};

// ---------------------------------------------------------------------------
// Nominatim — fallback, free, no API key, but capped at ~1 request/second
// per their usage policy (https://operations.osmfoundation.org/policies/nominatim/).
// ---------------------------------------------------------------------------
const NOMINATIM_USER_AGENT = "j172tw-health/1.0 (https://health.j172.tw)";
const throttleNominatim = rateLimiter(1100);

const queryNominatim = async (query: string): Promise<LatLng | null> => {
  await throttleNominatim();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=tw`;
  const { status, text } = await httpGetText(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } });
  if (status < 200 || status >= 300) {
    console.error(`geocodeAddress: Nominatim HTTP ${status} for "${query}"`);
    return null;
  }

  const data: { lat: string; lon: string }[] = JSON.parse(text);
  const first = data[0];
  if (!first) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
};

// Both providers are ultimately backed by OSM data for Taiwan, so a full
// address (e.g. "信義路二段79巷15號之8") very often returns zero results even
// though the road itself geocodes fine (verified directly against both
// APIs). Rather than fail outright, progressively drop the most granular
// segment (floor/sub-unit → house number → lane/alley) until something
// matches, trading pinpoint accuracy for at least landing on the right street.
const FALLBACK_STRIPS: RegExp[] = [
  /之\d+.*$/, // 之8一樓 (floor / sub-unit)
  /\d+號.*$/, // 79號
  /\d+巷.*$/, // 15巷
  /\d+弄.*$/, // 弄
];

/** Forward-geocodes a Taiwan address via OpenCage (primary) then Nominatim (fallback), each with progressive address simplification. Returns null if nothing matches at all. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const base = address.trim();
  if (!base) return null;

  const withCountry = (addr: string): string => (addr.includes("台灣") || addr.includes("臺灣") ? addr : `${addr}, 台灣`);

  let candidate = base;
  const tried = new Set<string>();

  for (let attempt = 0; attempt <= FALLBACK_STRIPS.length; attempt++) {
    if (attempt > 0) {
      candidate = candidate.replace(FALLBACK_STRIPS[attempt - 1], "").trim();
    }
    if (!candidate || tried.has(candidate)) continue;
    tried.add(candidate);

    const query = withCountry(candidate);
    try {
      const fromGoogle = await queryGoogle(query);
      if (fromGoogle) return fromGoogle;
    } catch (error) {
      console.error(`geocodeAddress: Google request failed for "${candidate}":`, error instanceof Error ? error.message : error);
    }

    try {
      const fromOpenCage = await queryOpenCage(query);
      if (fromOpenCage) return fromOpenCage;
    } catch (error) {
      console.error(`geocodeAddress: OpenCage request failed for "${candidate}":`, error instanceof Error ? error.message : error);
    }

    try {
      const fromNominatim = await queryNominatim(query);
      if (fromNominatim) return fromNominatim;
    } catch (error) {
      console.error(`geocodeAddress: Nominatim request failed for "${candidate}":`, error instanceof Error ? error.message : error);
    }
  }

  return null;
}
