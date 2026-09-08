import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署 (WRA) 開放資料平臺 — 水庫即時營運狀況，issue #135. Confirmed live
// (2026-09-08): no `api_key` param needed. Confirmed live: this dataset holds
// today's hourly readings per reservoir (rolls over daily), not an
// indefinitely-growing archive — 451 rows for 61 reservoirs on a plain
// unpaginated fetch, so a single generously-limited request is safe here
// (same reasoning as fetchWaterLevelStations.ts).
const RESERVOIR_STATUS_DATASET_URL =
  "https://opendata.wra.gov.tw/api/v2/2be9044c-6e44-4856-aad5-dd108c2e6679";
const FETCH_LIMIT = 5000;

export interface ReservoirStatusRecord {
  reservoirId: string;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS"), parsed from WRA's "observationtime". */
  observationTime: string;
  waterLevel: number | null;
  effectiveCapacity: number | null;
  inflowDischarge: number | null;
  totalOutflow: number | null;
  spillwayOutflow: number | null;
  powerOutletOutflow: number | null;
  drainageTunnelOutflow: number | null;
  desiltingTunnelOutflow: number | null;
  othersOutflow: number | null;
  waterDraw: number | null;
  accumulateRainfall: number | null;
  predeterminedCrossFlow: number | null;
  predeterminedOutflowTime: string | null;
  statusType: string | null;
}

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// Same "already Taipei local time, ISO-ish with T separator" convention as
// fetchWaterLevelStations.ts's "datetime" field.
const toMysqlDatetime = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim().replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

export async function fetchReservoirStatus(): Promise<ReservoirStatusRecord[]> {
  const url = `${RESERVOIR_STATUS_DATASET_URL}?sort=${encodeURIComponent("_importdate asc")}&format=JSON&limit=${FETCH_LIMIT}`;
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) {
    throw new Error(`WRA reservoir status request failed: HTTP ${status}`);
  }

  const data = JSON.parse(text);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return rows
    .map((rec): ReservoirStatusRecord | null => {
      const reservoirId = String(rec.reservoiridentifier ?? "").trim();
      const observationTime = toMysqlDatetime(rec.observationtime);
      if (!reservoirId || !observationTime) return null;

      return {
        reservoirId,
        observationTime,
        waterLevel: parseNum(rec.waterlevel),
        effectiveCapacity: parseNum(rec.effectivewaterstoragecapacity),
        inflowDischarge: parseNum(rec.inflowdischarge),
        totalOutflow: parseNum(rec.totaloutflow),
        spillwayOutflow: parseNum(rec.spillwayoutflow),
        powerOutletOutflow: parseNum(rec.poweroutletoutflow),
        drainageTunnelOutflow: parseNum(rec.drainagetunneloutflow),
        desiltingTunnelOutflow: parseNum(rec.desiltingtunneloutflow),
        othersOutflow: parseNum(rec.othersoutflow),
        waterDraw: parseNum(rec.waterdraw),
        accumulateRainfall: parseNum(rec.accumulaterainfallincatchment),
        predeterminedCrossFlow: parseNum(rec.predeterminedcrossflow),
        predeterminedOutflowTime: rec.predeterminedoutflowtime
          ? String(rec.predeterminedoutflowtime).trim() || null
          : null,
        statusType: rec.statustype ? String(rec.statustype).trim() || null : null,
      };
    })
    .filter((r): r is ReservoirStatusRecord => r !== null);
}
