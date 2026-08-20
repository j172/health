import "server-only";
import { httpGetText } from "@/lib/server/net/httpClient";
import { rateLimiter } from "@/lib/server/net/rateLimiter";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Taiwan bounding box (main island + Penghu, Kinmen, Matsu) used to reject
 * geocoder results that land somewhere else entirely — both providers will
 * occasionally return a confident-looking match in mainland China or Japan
 * for an ambiguous/malformed address rather than an empty result. Generous
 * on purpose (sanity check, not precision clipping).
 */
export const TAIWAN_BOUNDS = { minLat: 21.4, maxLat: 26.4, minLng: 118.0, maxLng: 122.3 } as const;

export function isWithinTaiwanBounds(lat: number, lng: number): boolean {
  return lat >= TAIWAN_BOUNDS.minLat && lat <= TAIWAN_BOUNDS.maxLat && lng >= TAIWAN_BOUNDS.minLng && lng <= TAIWAN_BOUNDS.maxLng;
}

export type GeocodeOutcome =
  | { kind: "ok"; coords: LatLng }
  | { kind: "no_result" }
  | { kind: "rejected"; reason: "out_of_bounds" | "low_confidence" }
  | { kind: "quota_exceeded" }
  | { kind: "error"; message: string };

const OPENCAGE_MIN_CONFIDENCE = 7;

const throttleOpenCage = rateLimiter(1000); // 1 req/sec per agreed policy

/**
 * OpenCage geocode — primary provider for the unified facility batch job.
 * Google is deliberately excluded here (see geocode.ts's queryGoogle doc
 * comment — unconfigured in production for cost reasons, and the spec calls
 * for OpenCage/Nominatim only regardless of that).
 */
export async function queryOpenCage(normalizedQuery: string): Promise<GeocodeOutcome> {
  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) return { kind: "error", message: "OPENCAGE_API_KEY not configured" };

  await throttleOpenCage();

  const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(normalizedQuery)}&key=${apiKey}&countrycode=tw&limit=1&no_annotations=1`;
  let status: number;
  let text: string;
  try {
    ({ status, text } = await httpGetText(url));
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }

  if (status === 402 || status === 429) return { kind: "quota_exceeded" };
  if (status < 200 || status >= 300) return { kind: "error", message: `OpenCage HTTP ${status}` };

  let data: { results: { geometry: { lat: number; lng: number }; confidence: number }[] };
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: "error", message: "OpenCage returned invalid JSON" };
  }

  const first = data.results?.[0];
  if (!first) return { kind: "no_result" };
  if (typeof first.confidence === "number" && first.confidence < OPENCAGE_MIN_CONFIDENCE) {
    return { kind: "rejected", reason: "low_confidence" };
  }
  const { lat, lng } = first.geometry;
  if (!isWithinTaiwanBounds(lat, lng)) return { kind: "rejected", reason: "out_of_bounds" };
  return { kind: "ok", coords: { lat, lng } };
}

const NOMINATIM_USER_AGENT = "j172tw-health/1.0 (https://health.j172.tw)";
const throttleNominatim = rateLimiter(1100); // 1 req/sec per Nominatim's usage policy, +100ms margin

/** Nominatim geocode — fallback once OpenCage's budget/circuit breaker is exhausted for the day. Free, no key, but capped at ~1 req/sec by OSM's usage policy. */
export async function queryNominatim(normalizedQuery: string): Promise<GeocodeOutcome> {
  await throttleNominatim();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedQuery)}&format=json&limit=1&countrycodes=tw`;
  let status: number;
  let text: string;
  try {
    ({ status, text } = await httpGetText(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT } }));
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }

  if (status === 429) return { kind: "quota_exceeded" };
  if (status < 200 || status >= 300) return { kind: "error", message: `Nominatim HTTP ${status}` };

  let data: { lat: string; lon: string }[];
  try {
    data = JSON.parse(text);
  } catch {
    return { kind: "error", message: "Nominatim returned invalid JSON" };
  }

  const first = data[0];
  if (!first) return { kind: "no_result" };
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { kind: "no_result" };
  if (!isWithinTaiwanBounds(lat, lng)) return { kind: "rejected", reason: "out_of_bounds" };
  return { kind: "ok", coords: { lat, lng } };
}
