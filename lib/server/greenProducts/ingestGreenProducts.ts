import { env } from "@/lib/server/config/env";
import { upsertGreenProducts, type GreenProductRecord } from "./queries";

const API_URL = "https://data.moenv.gov.tw/api/v2/gp_p_02";
const PAGE_SIZE = 1000;

export interface IngestGreenProductsResult {
  totalFetched: number;
  uniqueProducts: number;
  inserted: number;
  updated: number;
}

export async function runGreenProductsSync(): Promise<IngestGreenProductsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const all: any[] = [];
  let offset = 0;
  let page = 0;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`gp_p_02 fetch failed: HTTP ${res.status} (offset=${offset})`);
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json : [];
    page++;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const seenFlagNo = new Set<string>();
  const records: GreenProductRecord[] = [];

  for (const r of all) {
    const flagNo = (r.flagno || "").trim();
    const productName = (r.productname || "").trim();
    if (!flagNo || !productName) continue;
    if (seenFlagNo.has(flagNo)) continue;
    seenFlagNo.add(flagNo);

    records.push({
      flagNo,
      productName,
      classType: (r.classtype || "").trim() || null,
      signDate: (r.signdate || "").trim() || null,
      expireDate: (r.expiredate || "").trim() || null,
      dateExtendDate: (r.dateextenddate || "").trim() || null,
      isExpire: (r.isexpire || "").trim() || null,
    });
  }

  const { inserted, updated } = await upsertGreenProducts(records);

  return {
    totalFetched: all.length,
    uniqueProducts: records.length,
    inserted,
    updated,
  };
}
