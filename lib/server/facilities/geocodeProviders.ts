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

// Rate limiters per provider:
// - TGOS: 300ms (~3.3 req/sec)
// - OpenCage: 1000ms (1 req/sec per agreed policy)
// - Nominatim: 1100ms (1 req/sec per usage policy)
const throttleTgos = rateLimiter(300);
const throttleOpenCage = rateLimiter(1000); // 1 req/sec per agreed policy
const throttleOpenCage2 = rateLimiter(1000);

const queryOpenCageWithKey = async (apiKey: string | undefined, envVarName: string, throttle: () => Promise<void>, normalizedQuery: string): Promise<GeocodeOutcome> => {
  if (!apiKey) return { kind: "error", message: `${envVarName} not configured` };

  await throttle();

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
};

export interface TgosAddressItem {
  FULL_ADDR?: string;
  County?: string;
  Town?: string;
  Village?: string;
  Neighborhood?: string;
  Road?: string;
  Section?: string;
  Lane?: string;
  Alley?: string;
  Number?: string;
  X?: number | string;
  Y?: number | string;
  [key: string]: unknown;
}

export interface TgosResponse {
  Info?: Array<{
    IsSuccess?: string | boolean;
    InAddress?: string;
    [key: string]: unknown;
  }>;
  AddressList?: TgosAddressItem[];
  [key: string]: unknown;
}

/**
 * TGOS geocode — primary provider for Taiwan addresses via the official
 * Ministry of the Interior (MOI) National Land Surveying and Mapping Center
 * QueryAddr service.
 */
export async function queryTgos(normalizedQuery: string): Promise<GeocodeOutcome> {
  const appId = process.env.TGOS_APP_ID || process.env.TGOS_APPID;
  const apiKey = process.env.TGOS_API_KEY;
  if (!appId || !apiKey) {
    return { kind: "error", message: "TGOS credentials (TGOS_APP_ID / TGOS_APPID / TGOS_API_KEY) not configured" };
  }

  await throttleTgos();

  const params = new URLSearchParams({
    oAPPId: appId,
    oAPIKey: apiKey,
    oAddress: normalizedQuery,
    oSRS: "EPSG:4326",
    oFuzzyType: "0",
    oResultDataType: "JSON",
    oFuzzyBuffer: "0",
    oIsOnlyFullMatch: "false",
    oIsLockCounty: "false",
    oIsLockTown: "false",
    oIsLockVillage: "false",
    oIsLockRoadSection: "false",
    oIsLockLane: "false",
    oIsLockAlley: "false",
    oIsLockArea: "false",
    oIsSameNumber_SubNumber: "true",
    oCanIgnoreVillage: "true",
    oCanIgnoreNeighborhood: "true",
    oReturnMaxCount: "1",
  });

  const url = `https://addr.tgos.tw/addrws/v30/QueryAddr.asmx/QueryAddr?${params.toString()}`;

  let status: number;
  let text: string;
  try {
    ({ status, text } = await httpGetText(url));
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }

  if (status === 402 || status === 403 || status === 429) {
    return { kind: "quota_exceeded" };
  }
  if (status < 200 || status >= 300) {
    return { kind: "error", message: `TGOS HTTP ${status}` };
  }

  // ASMX Web Services wrap response in <string xmlns="http://tempuri.org/">...</string>
  let payload = text.trim();
  const xmlMatch = payload.match(/<string[^>]*>([\s\S]*?)<\/string>/i);
  if (xmlMatch) {
    payload = xmlMatch[1].trim();
  }

  if (payload.includes("額度已滿") || (payload.includes("超過") && (payload.includes("次數") || payload.includes("上限")))) {
    return { kind: "quota_exceeded" };
  }
  if (payload.startsWith("認證授權失敗") || payload.startsWith("錯誤") || payload.startsWith("缺少參數")) {
    return { kind: "error", message: `TGOS: ${payload}` };
  }

  let data: TgosResponse | TgosAddressItem[];
  try {
    data = JSON.parse(payload);
  } catch {
    return { kind: "error", message: `TGOS returned non-JSON: ${payload.slice(0, 100)}` };
  }

  const list: TgosAddressItem[] | undefined = Array.isArray(data) ? data : data.AddressList;
  const first = list?.[0];
  if (!first) return { kind: "no_result" };

  const lat = typeof first.Y === "number" ? first.Y : parseFloat(String(first.Y));
  const lng = typeof first.X === "number" ? first.X : parseFloat(String(first.X));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return { kind: "no_result" };

  if (!isWithinTaiwanBounds(lat, lng)) return { kind: "rejected", reason: "out_of_bounds" };
  return { kind: "ok", coords: { lat, lng } };
}

/**
 * OpenCage geocode (key1) — primary provider for the unified facility batch
 * job. Google is deliberately excluded here (see geocode.ts's queryGoogle
 * doc comment — unconfigured in production for cost reasons, and the spec
 * calls for OpenCage/Nominatim only regardless of that).
 */
export async function queryOpenCage(normalizedQuery: string): Promise<GeocodeOutcome> {
  return queryOpenCageWithKey(process.env.OPENCAGE_API_KEY, "OPENCAGE_API_KEY", throttleOpenCage, normalizedQuery);
}

/**
 * OpenCage geocode (key2) — a second, independent OpenCage account/key tried
 * once key1's daily budget (see geocodeBudget.ts's "opencage" provider) is
 * exhausted, before falling back to Nominatim. Optional: callers must check
 * OPENCAGE_API_KEY2 is set (or just let this return `error` and fall
 * through) — same "unconfigured means skip" shape as key1.
 */
export async function queryOpenCage2(normalizedQuery: string): Promise<GeocodeOutcome> {
  return queryOpenCageWithKey(process.env.OPENCAGE_API_KEY2, "OPENCAGE_API_KEY2", throttleOpenCage2, normalizedQuery);
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
