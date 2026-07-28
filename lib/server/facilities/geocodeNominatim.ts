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

/** Forward-geocodes a Taiwan address via Nominatim. Returns null on no match or failure. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = address.trim();
  if (!key) return null;

  await throttle();

  try {
    const q = encodeURIComponent(key.includes("台灣") || key.includes("臺灣") ? key : `${key}, 台灣`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=tw`;
    const { status, text } = await httpGetText(url, { headers: { "User-Agent": USER_AGENT } });
    if (status < 200 || status >= 300) return null;

    const data: { lat: string; lon: string }[] = JSON.parse(text);
    if (!data.length) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
