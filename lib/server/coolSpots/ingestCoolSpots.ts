import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

/**
 * Fetches MOENV's Cool Map 涼適點點位 (gis_p_82) open-data API and upserts the
 * records directly into the `facilities` table, in-process — no HTTP round
 * trip to this app's own admin endpoint, so this is immune to the Cloudflare
 * bot-protection 403 that blocks scripts/import-moenv-cool-spots.mjs's POST
 * to the public hostname (see issue #156). This is now the durable path for
 * this source; the standalone script stays only as a manual/local fallback.
 *
 * Ported from scripts/import-moenv-cool-spots.mjs, with one fix: that script
 * read PascalCase field names (row.PlaceName, row.Address, ...) that do not
 * exist on this API's actual response shape. Every other data.moenv.gov.tw
 * v2 dataset already wired into this codebase (gp_p_02, gp_p_43, epr_p_02,
 * aqx_p_23, wr_s_04, cfp_p_01/02) returns all-lowercase keys with no
 * separators (flagno, productname, placename, organizationname, ...) — gis_p_82
 * follows the same convention, so the PascalCase accessors matched nothing
 * and every row got silently dropped by the `!name && !address` guard,
 * which is the actual reason cool_spot has stayed at 0 rows in production
 * even before the deploy-step Cloudflare block is accounted for.
 *
 * Each record from gis_p_82 contains (lowercase keys):
 * - recordid: 店代碼
 * - coolingtype: 店家種類
 * - stationtype: 設施類型
 * - placename: 名稱
 * - city / district: 縣市 / 鄉鎮
 * - address: 地址
 * - phone: 電話
 * - longitude / latitude: 經緯度
 * - openinghours: 營業時間
 * - airconditioning / restroom / seats / waterdispenser / isoutdoor / isaccessible: 設施旗標
 */

const API_URL = "https://data.moenv.gov.tw/api/v2/gis_p_82";
const PAGE_SIZE = 1000;

export interface IngestCoolSpotsResult {
  totalFetched: number;
  uniqueCoolSpots: number;
  inserted: number;
  updated: number;
}

const text = (value: unknown): string => (value == null ? "" : String(value).trim());

const num = (value: unknown): number | null => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
};

const isTruthy = (value: unknown): boolean => {
  const v = text(value).toLowerCase();
  return v === "1" || v === "y" || v === "yes" || v === "true" || v === "有" || v === "是";
};

/** The amenity flags, joined into serviceItem so a searcher can tell at a glance what's on offer. */
const describe = (row: Record<string, unknown>): string | null => {
  const parts = [
    text(row.coolingtype),
    text(row.stationtype),
    isTruthy(row.airconditioning) ? "有冷氣" : "",
    isTruthy(row.restroom) ? "有廁所" : "",
    isTruthy(row.seats) ? "有座位" : "",
    isTruthy(row.waterdispenser) ? "有飲水機" : "",
    isTruthy(row.isaccessible) ? "無障礙設施" : "",
    isTruthy(row.isoutdoor) ? "戶外" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("｜") : null;
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
      throw new Error(`gis_p_82 fetch failed: HTTP ${status} (offset=${offset})`);
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
    const name = text(row.placename);
    const address = text(row.address);
    if (!name && !address) continue;

    const recordId = text(row.recordid);
    const sourceId = recordId || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const phone = text(row.phone);
    const fullAddress = [text(row.city), text(row.district), address].filter(Boolean).join("");

    records.push({
      facilityType: "cool_spot",
      sourceKey: "moenv_cool_spot",
      sourceId,
      name,
      address: fullAddress ? normalizeAddress(fullAddress) : null,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: num(row.latitude),
      lng: num(row.longitude),
      serviceItem: describe(row),
      serviceTime: text(row.openinghours) || null,
      dataOrg: "環境部",
    });
  }

  return records;
}

export async function runCoolSpotsSync(): Promise<IngestCoolSpotsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const rows = await fetchAllRows(apiKey);
  const records = toRecords(rows);
  const { inserted, updated } = await upsertFacilities(records);

  return {
    totalFetched: rows.length,
    uniqueCoolSpots: records.length,
    inserted,
    updated,
  };
}
