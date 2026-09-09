import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署 (WRA) 開放資料平臺 — 水庫代碼表 (dataset/139336).
// Confirmed live (2026-09-09): no `api_key` param needed.
// Provides official reservoir Chinese name, river, town name, and area code.
const RESERVOIR_CATALOG_DATASET_URL =
  "https://opendata.wra.gov.tw/api/v2/f65a2148-9c7a-4e16-acaf-48917a5124e2";
const FETCH_LIMIT = 2000;

export interface ReservoirCatalogRecord {
  reservoirId: string;
  reservoirName: string;
  riverName: string | null;
  townName: string | null;
  areaCode: string | null;
}

const cleanStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

export async function fetchReservoirCatalog(): Promise<ReservoirCatalogRecord[]> {
  const url = `${RESERVOIR_CATALOG_DATASET_URL}?sort=${encodeURIComponent("_importdate asc")}&format=JSON&limit=${FETCH_LIMIT}`;
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) {
    throw new Error(`WRA reservoir catalog request failed: HTTP ${status}`);
  }

  const data = JSON.parse(text);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return rows
    .map((rec): ReservoirCatalogRecord | null => {
      const reservoirId = cleanStr(rec["水庫代碼"] ?? rec.reservoiridentifier ?? rec.reservoir_id);
      const reservoirName = cleanStr(rec["水庫名稱"] ?? rec.reservoirname ?? rec.reservoir_name);
      if (!reservoirId || !reservoirName) return null;

      return {
        reservoirId,
        reservoirName,
        riverName: cleanStr(rec["河川名稱"] ?? rec.rivername ?? rec.river_name),
        townName: cleanStr(rec["鄉鎮名稱"] ?? rec.townname ?? rec.town_name),
        areaCode: cleanStr(rec["行政區域代碼"] ?? rec.areacode ?? rec.area_code),
      };
    })
    .filter((r): r is ReservoirCatalogRecord => r !== null);
}
