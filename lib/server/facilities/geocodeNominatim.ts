import { httpGetText } from "@/lib/server/net/httpClient";

// OpenStreetMap Nominatim — free, no API key, but capped at ~1 request/second
// per their usage policy (https://operations.osmfoundation.org/policies/nominatim/).
const USER_AGENT = "j172tw-health/1.0 (https://health.j172.tw)";
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

const throttle = async (): Promise<void> => {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
};

export interface LatLng {
  lat: number;
  lng: number;
}

const querySearch = async (query: string): Promise<LatLng | null> => {
  await throttle();
  const q = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=tw`;
  const { status, text } = await httpGetText(url, { headers: { "User-Agent": USER_AGENT } });
  if (status < 200 || status >= 300) {
    console.error(`geocodeAddress: Nominatim HTTP ${status} for "${query}"`);
    return null;
  }

  const data: { lat: string; lon: string }[] = JSON.parse(text);
  if (!data.length) return null;

  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  return isNaN(lat) || isNaN(lng) ? null : { lat, lng };
};

// OSM's Taiwan coverage is solid at the road level but sparse at individual
// house numbers — a full address (e.g. "信義路二段79巷15號之8") very often
// returns zero results even though the road itself geocodes fine. Rather
// than fail outright, progressively drop the most granular segment (floor/
// sub-unit → house number → lane/alley) until something matches, trading
// pinpoint accuracy for at least landing on the right street.
const FALLBACK_STRIPS: [RegExp, string][] = [
  [/之\d+.*$/, ""], // 之8一樓 (floor / sub-unit)
  [/\d+號.*$/, ""], // 79號
  [/\d+巷.*$/, ""], // 15巷
  [/\d+弄.*$/, ""], // 弄
];

/** Forward-geocodes a Taiwan address via Nominatim, falling back to a coarser address if the exact one has no match. Returns null if nothing matches at all. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const base = address.trim();
  if (!base) return null;

  const withCountry = (addr: string): string => (addr.includes("台灣") || addr.includes("臺灣") ? addr : `${addr}, 台灣`);

  let candidate = base;
  const tried = new Set<string>();

  for (let attempt = 0; attempt <= FALLBACK_STRIPS.length; attempt++) {
    if (attempt > 0) {
      const [pattern] = FALLBACK_STRIPS[attempt - 1];
      candidate = candidate.replace(pattern, "").trim();
    }
    if (!candidate || tried.has(candidate)) continue;
    tried.add(candidate);

    try {
      const result = await querySearch(withCountry(candidate));
      if (result) return result;
    } catch (error) {
      console.error(`geocodeAddress: request failed for "${candidate}":`, error instanceof Error ? error.message : error);
    }
  }

  return null;
}
