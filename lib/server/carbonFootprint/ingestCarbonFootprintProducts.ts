import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import { upsertCarbonFootprintProducts, type CarbonFootprintProductRecord } from "./queries";

const API_URL = "https://data.moenv.gov.tw/api/v2/cfp_p_01";
const PAGE_SIZE = 1000;

export interface IngestCarbonFootprintProductsResult {
  totalFetched: number;
  uniqueProducts: number;
  inserted: number;
  updated: number;
}

export async function runCarbonFootprintProductsSync(): Promise<IngestCarbonFootprintProductsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const all: any[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text } = await httpGetText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`cfp_p_01 fetch failed: HTTP ${status} (offset=${offset})`);
    }
    const json = JSON.parse(text);
    const rows = Array.isArray(json) ? json : [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const seenCode = new Set<string>();
  const records: CarbonFootprintProductRecord[] = [];

  for (const r of all) {
    const cfplCode = (r.cfpl_code || "").trim();
    const productName = (r.product_name || "").trim();
    if (!cfplCode || !productName) continue;
    if (seenCode.has(cfplCode)) continue;
    seenCode.add(cfplCode);

    records.push({
      cfplCode,
      productName,
      companyName: (r.company_name || "").trim() || null,
      carbonFootprintData: (r.product_carbon_footprint_data || "").trim() || null,
      declaredUnit: (r.declared_unit || "").trim() || null,
      expireDate: (r.expireddate || "").trim() || null,
    });
  }

  const { inserted, updated } = await upsertCarbonFootprintProducts(records);

  return {
    totalFetched: all.length,
    uniqueProducts: records.length,
    inserted,
    updated,
  };
}
