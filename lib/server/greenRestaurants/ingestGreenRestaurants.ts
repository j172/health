import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

/**
 * Fetches MOENV's 環保餐廳環境即時通地圖資料 (gis_p_11) open-data API and
 * upserts the records directly into the `facilities` table, in-process — no
 * HTTP round trip to this app's own admin endpoint. Follows the exact
 * pattern established by lib/server/coolSpots/ingestCoolSpots.ts for
 * gis_p_82 (issue #156): a direct in-process call avoids the Cloudflare
 * bot-protection 403 that silently swallowed the old
 * deploy-script-POSTs-to-public-hostname approach.
 *
 * gis_p_11 was the one dataset left over from #130 (see PR #149) because it
 * was believed to need its own API key; it turns out to share the same
 * account-wide MOENV_GP_API_KEY already used by gp_p_42/gp_p_43 (green
 * hotels) and gis_p_82 (cool spots) — see issue #163.
 *
 * Each record from gis_p_11 contains (lowercase keys):
 * - restid: 餐廳編號
 * - name: 餐廳名稱
 * - address: 地址
 * - phone / mobile: 電話 / 行動電話
 * - latitude / longitude: 經緯度 (provided directly — no geocoding needed,
 *   same as gis_p_82; unlike aqx_p_23/wr_s_04 which needed the
 *   address-fallback geocode cascade)
 * - city: 縣市
 */

const API_URL = "https://data.moenv.gov.tw/api/v2/gis_p_11";
const PAGE_SIZE = 1000;

export interface IngestGreenRestaurantsResult {
  totalFetched: number;
  uniqueGreenRestaurants: number;
  inserted: number;
  updated: number;
}

const text = (value: unknown): string => (value == null ? "" : String(value).trim());

const num = (value: unknown): number | null => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

async function fetchAllRows(apiKey: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;

  for (;;) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text: body } = await httpGetText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`gis_p_11 fetch failed: HTTP ${status} (offset=${offset})`);
    }
    const json = JSON.parse(body);
    const rows: Record<string, unknown>[] = Array.isArray(json) ? json : (json.records ?? []);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

function toRecords(rows: Record<string, unknown>[]): FacilityRecord[] {
  const seen = new Set<string>();
  const records: FacilityRecord[] = [];

  for (const row of rows) {
    const name = text(row.name);
    const address = text(row.address);
    if (!name && !address) continue;

    const restId = text(row.restid);
    const sourceId = restId || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const phone = text(row.phone);
    const mobile = text(row.mobile);
    const combinedPhone = [phone, mobile].filter(Boolean).join("｜");
    const fullAddress = [text(row.city), address].filter(Boolean).join("");

    records.push({
      facilityType: "green_restaurant",
      sourceKey: "moenv_green_restaurant",
      sourceId,
      name,
      address: fullAddress ? normalizeAddress(fullAddress) : null,
      phone: combinedPhone ? toHalfwidthDigits(combinedPhone) : null,
      lat: num(row.latitude),
      lng: num(row.longitude),
      serviceItem: null,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  return records;
}

export async function runGreenRestaurantsSync(): Promise<IngestGreenRestaurantsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const rows = await fetchAllRows(apiKey);
  const records = toRecords(rows);
  const { inserted, updated } = await upsertFacilities(records);

  return {
    totalFetched: rows.length,
    uniqueGreenRestaurants: records.length,
    inserted,
    updated,
  };
}
