import { env } from "@/lib/server/config/env";
import { httpGetText } from "@/lib/server/net/httpClient";
import {
  upsertCarbonFootprintCoefficients,
  type CarbonFootprintCoefficientRecord,
} from "./coefficientsQueries";

const API_URL = "https://data.moenv.gov.tw/api/v2/cfp_p_02";
const PAGE_SIZE = 1000;

export interface IngestCarbonFootprintCoefficientsResult {
  totalFetched: number;
  uniqueRecords: number;
  inserted: number;
  updated: number;
}

export async function runCarbonFootprintCoefficientsSync(): Promise<IngestCarbonFootprintCoefficientsResult> {
  const apiKey = env.moenvGpApiKey || env.moenvNewsApiKey;
  if (!apiKey) {
    throw new Error("MOENV_GP_API_KEY (or MOENV_AQI_API_KEY) is not configured");
  }

  const all: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text } = await httpGetText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`cfp_p_02 fetch failed: HTTP ${status} (offset=${offset})`);
    }
    const json = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(json) ? json : [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const seenKey = new Set<string>();
  const records: CarbonFootprintCoefficientRecord[] = [];

  for (const r of all) {
    const coefficientName = String(r.name ?? "").trim();
    if (!coefficientName) continue;

    const unit = String(r.unit ?? "").trim() || null;
    const departmentName = String(r.departmentname ?? "").trim();
    const announcementYear = String(r.announcementyear ?? "").trim();
    const coeRaw = r.coe;
    const coefficientValue =
      coeRaw === null || coeRaw === undefined || coeRaw === "" ? null : parseFloat(String(coeRaw));

    // Mirrors the DB's composite unique key (coefficient_name, unit, department_name, announcement_year).
    const key = `${coefficientName}|${unit ?? ""}|${departmentName}|${announcementYear}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);

    records.push({
      coefficientName,
      coefficientValue: coefficientValue !== null && !isNaN(coefficientValue) ? coefficientValue : null,
      unit,
      departmentName,
      announcementYear,
    });
  }

  const { inserted, updated } = await upsertCarbonFootprintCoefficients(records);

  return {
    totalFetched: all.length,
    uniqueRecords: records.length,
    inserted,
    updated,
  };
}
