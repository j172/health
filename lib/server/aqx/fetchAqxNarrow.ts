import { httpGetText } from "@/lib/server/net/httpClient";

// 環境部開放資料平臺 — 「窄表」單筆讀值資料集：一列一筆量測值 (issue #131).
// Shared fetch for AQX_P_318 (CO 8hr) / AQX_P_319 (PM10) / AQX_P_35 (其它測項).
const BASE_URL = "https://data.moenv.gov.tw/api/v2";
const PAGE_SIZE = 1000;

export interface AqxNarrowRecord {
  datasetCode: string;
  siteId: string;
  siteName: string;
  county: string | null;
  itemId: string;
  itemName: string;
  itemEngName: string | null;
  itemUnit: string | null;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS") — this is the reading's own timestamp. */
  monitorDate: string;
  concentration: number | null;
}

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// MOENV's narrow-shape datasets have been observed shipping "monitordate" as
// "2026/09/08 08:00:00" (slashes, already Taipei local time — same convention
// as aqx_p_432's "publishtime") or "2026-09-08 08:00" (no seconds, like
// aqx_p_02's "datacreationdate"). Normalize both to MySQL DATETIME.
const toMysqlDatetime = (raw: unknown): string | null => {
  let s = String(raw ?? "").trim().replace(/\//g, "-").replace("T", " ");
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s = `${s}:00`;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

/** Fetches one "narrow" AQX dataset (AQX_P_318 / AQX_P_319 / AQX_P_35). */
export async function fetchAqxNarrowDataset(datasetCode: string): Promise<AqxNarrowRecord[]> {
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
    .map((rec): AqxNarrowRecord | null => {
      const siteId = String(rec.siteid ?? "").trim();
      const itemId = String(rec.itemid ?? "").trim();
      const monitorDate = toMysqlDatetime(rec.monitordate);
      if (!siteId || !itemId || !monitorDate) return null;

      return {
        datasetCode,
        siteId,
        siteName: String(rec.sitename ?? "").trim(),
        county: rec.county ? String(rec.county).trim() : null,
        itemId,
        itemName: String(rec.itemname ?? "").trim(),
        itemEngName: rec.itemengname ? String(rec.itemengname).trim() : null,
        itemUnit: rec.itemunit ? String(rec.itemunit).trim() : null,
        monitorDate,
        concentration: parseNum(rec.concentration),
      };
    })
    .filter((r): r is AqxNarrowRecord => r !== null);
}
