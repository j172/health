import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";
import { normalizeAddress, toHalfwidthDigits } from "@/lib/server/facilities/csv";

/**
 * Fetches MOENV's 地方清潔隊聯絡資訊 (wr_s_04) open-data API and upserts the
 * records directly into the `facilities` table, in-process — no HTTP round
 * trip to this app's own admin endpoint, so this is immune to the Cloudflare
 * bot-protection 403 that blocks scripts/import-moenv-cleaning-squads.mjs's
 * POST to the public hostname (see issue #156). This is now the durable path
 * for this source; the standalone script stays only as a manual/local
 * fallback.
 *
 * Ported from scripts/import-moenv-cleaning-squads.mjs, unchanged mapping
 * logic — the deploy log showed real rows parsed, just never landing due to
 * the Cloudflare block.
 *
 * Each record from wr_s_04 contains:
 * - countycode: 縣市代碼
 * - organizationname: 清潔隊名稱
 * - organizationaddress: 地址
 * - organizationtel: 電話
 *
 * No natural per-row id in this feed, so sourceId is derived from
 * (countycode, organizationname). Carries no coordinates — enters the shared
 * address-geocode backfill like every other address-only facility source.
 */

const API_URL = "https://data.moenv.gov.tw/api/v2/wr_s_04";
const PAGE_SIZE = 1000;

export interface IngestCleaningSquadsResult {
  totalFetched: number;
  uniqueCleaningSquads: number;
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
      throw new Error(`wr_s_04 fetch failed: HTTP ${status} (offset=${offset})`);
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
    const name = text(row.organizationname);
    const address = text(row.organizationaddress);
    if (!name && !address) continue;

    const countyCode = text(row.countycode);
    const sourceId = `${countyCode}_${name}` || `${name}_${address}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);

    const phone = text(row.organizationtel);

    records.push({
      facilityType: "cleaning_squad",
      sourceKey: "moenv_cleaning_squad",
      sourceId,
      name,
      address: address ? normalizeAddress(address) : null,
      phone: phone ? toHalfwidthDigits(phone) : null,
      lat: null,
      lng: null,
      serviceItem: null,
      serviceTime: null,
      dataOrg: "環境部",
    });
  }

  return records;
}

export async function runCleaningSquadsSync(): Promise<IngestCleaningSquadsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const rows = await fetchAllRows(apiKey);
  const records = toRecords(rows);
  const { inserted, updated } = await upsertFacilities(records);

  return {
    totalFetched: rows.length,
    uniqueCleaningSquads: records.length,
    inserted,
    updated,
  };
}
