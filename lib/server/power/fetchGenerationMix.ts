import { httpRequest } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { decodeCsvBuffer } from "./csvEncoding";
import type { GenerationMixRecord } from "./types";

// 經濟部能源署 set_id=55 — 全國發電來源配比 (台電/民營電廠/汽電共生 + 合計, only
// ~4 rows). Confirmed live via a GitHub Actions egress probe: despite the URL
// having no file extension, the response is CSV (Content-Disposition:
// attachment), not JSON. Barely ever changes — synced daily, not every 10
// minutes. See docs/specs/taipower-energy-dashboard.md.
const GENERATION_MIX_URL =
  "https://www.moeaea.gov.tw/ECW/populace/opendata/wHandOpenData_File.ashx?set_id=55";

const parseNum = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const cleaned = v.replace(/%/g, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

export async function fetchGenerationMix(): Promise<GenerationMixRecord[]> {
  const response = await httpRequest(GENERATION_MIX_URL, { timeoutMs: 20_000 });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MOEAEA set_id=55 request failed: HTTP ${response.status}`);
  }

  const text = decodeCsvBuffer(response.buffer);
  const rows = parseCsv(text);

  return rows
    .map((row): GenerationMixRecord | null => {
      const sourceCategory = (row["電力來源"] ?? "").trim();
      if (!sourceCategory) return null;

      return {
        sourceCategory,
        capacityMw: parseNum(row["總裝置容量(數值,MW)"]),
        capacityRatioPct: parseNum(row["配比(%)"]),
        dataOrg: (row["資料所屬機關"] ?? "").trim() || null,
      };
    })
    .filter((r): r is GenerationMixRecord => r !== null);
}
