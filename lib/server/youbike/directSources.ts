import "server-only";
import { httpGetJson } from "@/lib/server/net/httpClient";
import { cleanName, formatTime } from "./format";
import type { YouBikeStation } from "./types";

/**
 * The free, quota-less open-data feeds for YouBike stations. Taipei and New Taipei are ALWAYS read
 * from here (they used to be pulled through TDX as well, burning 4 of the 30 requests of every
 * round for data that is free); Hsinchu City is only a last-resort fallback for when TDX has no
 * Hsinchu data (its host answers slowly or not at all, so it has a short timeout and a cool-down).
 * The field mapping below is the one runSync.ts always used for these feeds, moved here unchanged.
 */

export type HttpGetJsonFn = (
  url: string,
  options: { timeoutMs: number },
) => Promise<{ status: number; data: unknown }>;

export interface DirectFetchResult {
  stations: YouBikeStation[];
  /** One entry in the sync summary's `errors` when something went wrong (the wording operators already know). */
  error?: string;
}

const TAIPEI_URL = "https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json";
const NEW_TAIPEI_PAGE_SIZE = 1000;
const NEW_TAIPEI_MAX_PAGES = 3;
const newTaipeiUrl = (page: number): string =>
  `https://data.ntpc.gov.tw/api/datasets/010e5b15-3823-4b20-b401-b1cf000550c5/json?page=${page}&size=${NEW_TAIPEI_PAGE_SIZE}`;
const HSINCHU_URL =
  "https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/59/5776ed30-fa3c-48f4-9876-d8fb28df0501.json";

/** Hsinchu's host usually times out; do not let a dead host hold a round (it was 10 s). */
export const HSINCHU_DIRECT_TIMEOUT_MS = 5000;
/** After a failed Hsinchu attempt, do not try again for this long. */
export const HSINCHU_DIRECT_COOLDOWN_MS = 60 * 60_000;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function parseTaipeiStations(rows: unknown[]): YouBikeStation[] {
  const stations: YouBikeStation[] = [];
  for (const s of rows as Record<string, unknown>[]) {
    const sno = String(s.sno || "");
    if (!sno) continue;
    stations.push({
      cityCode: "TPE",
      stationNo: sno,
      nameTw: cleanName(s.sna as string),
      districtTw: (s.sarea as string) || "",
      addressTw: (s.ar as string) || "",
      lat: parseFloat(String(s.latitude)) || 0,
      lng: parseFloat(String(s.longitude)) || 0,
      totalSpaces: parseInt(String(s.Quantity), 10) || 0,
      availableBikes: parseInt(String(s.available_rent_bikes), 10) || 0,
      availableEbikes: 0,
      emptySpaces: parseInt(String(s.available_return_bikes), 10) || 0,
      isActive: s.act === "1" ? 1 : 0,
      updatedAtSource: formatTime((s.updateTime || s.srcUpdateTime || s.mday) as string),
    });
  }
  return stations;
}

export function parseNewTaipeiStations(rows: unknown[]): YouBikeStation[] {
  const stations: YouBikeStation[] = [];
  for (const s of rows as Record<string, unknown>[]) {
    const sno = String(s.sno || "");
    if (!sno) continue;
    stations.push({
      cityCode: "NTPC",
      stationNo: sno,
      nameTw: cleanName(s.sna as string),
      districtTw: (s.sarea as string) || "",
      addressTw: (s.ar as string) || "",
      lat: parseFloat(String(s.lat)) || 0,
      lng: parseFloat(String(s.lng)) || 0,
      totalSpaces: parseInt(String(s.tot_quantity), 10) || 0,
      availableBikes: parseInt(String(s.sbi_quantity), 10) || parseInt(String(s.yb2_quantity), 10) || 0,
      availableEbikes: parseInt(String(s.eyb_quantity), 10) || 0,
      emptySpaces: parseInt(String(s.bemp), 10) || 0,
      isActive: s.act === "1" ? 1 : 0,
      updatedAtSource: formatTime(s.mday as string),
    });
  }
  return stations;
}

/** Hsinchu's feed carries no availability, so the counts are placeholders (as they always were for this fallback). */
export function parseHsinchuStations(rows: unknown[]): YouBikeStation[] {
  const stations: YouBikeStation[] = [];
  for (let i = 0; i < rows.length; i++) {
    const s = rows[i] as Record<string, unknown>;
    const name = (s["站點名稱"] || s.sna || "") as string;
    stations.push({
      cityCode: "HSC",
      stationNo: `HSC_${i + 1}`,
      nameTw: cleanName(name),
      districtTw: "新竹市",
      addressTw: (s["站點位置"] || s.ar || "") as string,
      lat: parseFloat(String(s["緯度"] || s.lat)) || 0,
      lng: parseFloat(String(s["經度"] || s.lng)) || 0,
      totalSpaces: 20,
      availableBikes: 10,
      availableEbikes: 0,
      emptySpaces: 10,
      isActive: 1,
      updatedAtSource: new Date().toISOString().slice(0, 19).replace("T", " "),
    });
  }
  return stations;
}

export async function fetchTaipeiDirect(get: HttpGetJsonFn = httpGetJson): Promise<DirectFetchResult> {
  try {
    const res = await get(TAIPEI_URL, { timeoutMs: 15000 });
    if (res.status === 200 && Array.isArray(res.data)) {
      return { stations: parseTaipeiStations(res.data) };
    }
    return { stations: [], error: `Taipei returned status ${res.status}` };
  } catch (err) {
    return { stations: [], error: `Taipei fetch failed: ${errorMessage(err)}` };
  }
}

export async function fetchNewTaipeiDirect(get: HttpGetJsonFn = httpGetJson): Promise<DirectFetchResult> {
  const stations: YouBikeStation[] = [];
  try {
    for (let page = 0; page < NEW_TAIPEI_MAX_PAGES; page++) {
      const res = await get(newTaipeiUrl(page), { timeoutMs: 15000 });
      if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
        stations.push(...parseNewTaipeiStations(res.data));
        if (res.data.length < NEW_TAIPEI_PAGE_SIZE) break;
      } else {
        break;
      }
    }
    return { stations };
  } catch (err) {
    // Pages already read are still good data: keep them, as the loop always did before failing.
    return { stations, error: `New Taipei fetch failed: ${errorMessage(err)}` };
  }
}

export async function fetchHsinchuDirect(
  get: HttpGetJsonFn = httpGetJson,
  timeoutMs: number = HSINCHU_DIRECT_TIMEOUT_MS,
): Promise<DirectFetchResult> {
  try {
    const res = await get(HSINCHU_URL, { timeoutMs });
    if (res.status === 200 && Array.isArray(res.data)) {
      return { stations: parseHsinchuStations(res.data) };
    }
    return { stations: [], error: `Hsinchu returned status ${res.status}` };
  } catch (err) {
    return { stations: [], error: `Hsinchu fetch failed: ${errorMessage(err)}` };
  }
}

/**
 * Wraps a Hsinchu fetcher so a failed attempt is not repeated for `cooldownMs`. The host is dead
 * far more often than not, and the TDX job that calls this runs every 15 minutes.
 */
export function withCooldown(
  fetcher: () => Promise<DirectFetchResult>,
  cooldownMs: number = HSINCHU_DIRECT_COOLDOWN_MS,
  now: () => number = () => Date.now(),
): () => Promise<DirectFetchResult> {
  let nextAttemptAtMs = 0;
  return async () => {
    if (now() < nextAttemptAtMs) return { stations: [] };
    const result = await fetcher();
    if (result.stations.length === 0) nextAttemptAtMs = now() + cooldownMs;
    return result;
  };
}
