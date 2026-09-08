import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { normalizeAddress } from "@/lib/server/facilities/csv";

/**
 * Fetches MOENV's 應符合室內空氣品質法之公告場所 (aqx_p_23) open-data API and
 * upserts the records directly into the `facilities` table, in-process — no
 * HTTP round trip to this app's own admin endpoint, so this is immune to the
 * Cloudflare bot-protection 403 that blocks
 * scripts/import-moenv-iaq-premises.mjs's POST to the public hostname (see
 * issue #156). This is now the durable path for this source; the standalone
 * script stays only as a manual/local fallback.
 *
 * Ported from scripts/import-moenv-iaq-premises.mjs. Unlike the cool-spots
 * dataset this one's field names checked out against a working run (the
 * deploy log showed real rows parsed, just never landing due to the
 * Cloudflare block), so the mapping logic is unchanged.
 *
 * Each record from aqx_p_23 contains:
 * - placeid: 場所代碼
 * - placename: 場所名稱
 * - zipcode: 郵遞區號
 * - address: 地址
 * - placetype: 場所類別
 *
 * Carries no coordinates — enters the shared address-geocode backfill (see
 * lib/server/facilities/geocodeBatch.ts's SOURCES_IN_PRIORITY) like every
 * other address-only facility source.
 */

const API_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_23";
const PAGE_SIZE = 1000;

export interface IngestIaqPremisesResult {
  totalFetched: number;
  uniquePremises: number;
  inserted: number;
  updated: number;
}

const text = (value: unknown): string => (value == null ? "" : String(value).trim());

async function fetchAllRows(apiKey: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;

  for (;;) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text: body } = await httpGetText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`aqx_p_23 fetch failed: HTTP ${status} (offset=${offset})`);
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

    const placeId = text(row.placeid);
    const sourceId = placeId || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const zipcode = text(row.zipcode);
    const fullAddress = zipcode && !address.startsWith(zipcode) ? `${zipcode}${address}` : address;

    records.push({
      facilityType: "iaq_premise",
      sourceKey: "moenv_iaq_premise",
      sourceId,
      name,
      address: fullAddress ? normalizeAddress(fullAddress) : null,
      phone: null,
      lat: null,
      lng: null,
      serviceItem: text(row.placetype) || null,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  return records;
}

export async function runIaqPremisesSync(): Promise<IngestIaqPremisesResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const rows = await fetchAllRows(apiKey);
  const records = toRecords(rows);
  const { inserted, updated } = await upsertFacilities(records);

  return {
    totalFetched: rows.length,
    uniquePremises: records.length,
    inserted,
    updated,
  };
}
