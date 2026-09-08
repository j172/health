import { httpGetText } from "@/lib/server/net/httpClient";

// 環境部開放資料平臺 — 「寬表」小時值資料集：一列/測站/測項/日期，24 個小時值欄位
// (issue #131). Shared fetch for AQX_P_15/16/17/18/25 — see lib/server/aqx/datasets.ts.
const BASE_URL = "https://data.moenv.gov.tw/api/v2";
const PAGE_SIZE = 1000;

export interface AqxWideRecord {
  datasetCode: string;
  siteId: string;
  siteName: string;
  itemId: string;
  itemName: string;
  itemEngName: string | null;
  itemUnit: string | null;
  /** MySQL DATE string ("YYYY-MM-DD"). */
  monitorDate: string;
  /** 24 entries, index 0 = hour 00, index 23 = hour 23. Missing/unparseable readings are null. */
  hourlyValues: (number | null)[];
}

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// MOENV ships "monitordate" for these datasets as either "2026-09-08" or
// "2026/09/08" depending on dataset — normalize slashes and drop any time
// portion (the hourly breakdown lives in the monitorvalueNN columns, not here).
const toMysqlDate = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim().replace(/\//g, "-");
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

/**
 * Fetches one "wide" AQX dataset (AQX_P_15/16/17/18/25). Note that AQX_P_25's
 * data dictionary lists one field fewer than the others (30 vs 31) — likely a
 * missing sitename — so this only *requires* siteid/itemid/monitordate to be
 * present; sitename falls back to an empty string rather than dropping the row.
 */
export async function fetchAqxWideDataset(datasetCode: string): Promise<AqxWideRecord[]> {
  const apiKey = process.env.MOENV_AQI_API_KEY;
  if (!apiKey) {
    throw new Error("MOENV_AQI_API_KEY is not configured");
  }

  const all: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const url = `${BASE_URL}/${datasetCode}?format=JSON&limit=${PAGE_SIZE}&offset=${offset}&api_key=${encodeURIComponent(apiKey)}`;
    // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
    // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
    const { status, text } = await httpGetText(url);
    if (status < 200 || status >= 300) {
      throw new Error(`MOENV ${datasetCode} request failed: HTTP ${status} (offset=${offset})`);
    }
    const data = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all
    .map((rec): AqxWideRecord | null => {
      const siteId = String(rec.siteid ?? "").trim();
      const itemId = String(rec.itemid ?? "").trim();
      const monitorDate = toMysqlDate(rec.monitordate);
      if (!siteId || !itemId || !monitorDate) return null;

      const hourlyValues: (number | null)[] = [];
      for (let h = 0; h < 24; h++) {
        const key = `monitorvalue${String(h).padStart(2, "0")}`;
        hourlyValues.push(parseNum(rec[key]));
      }

      return {
        datasetCode,
        siteId,
        siteName: String(rec.sitename ?? "").trim(),
        itemId,
        itemName: String(rec.itemname ?? "").trim(),
        itemEngName: rec.itemengname ? String(rec.itemengname).trim() : null,
        itemUnit: rec.itemunit ? String(rec.itemunit).trim() : null,
        monitorDate,
        hourlyValues,
      };
    })
    .filter((r): r is AqxWideRecord => r !== null);
}
