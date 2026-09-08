import { httpGetText } from "@/lib/server/net/httpClient";

// 經濟部水利署 (WRA) 開放資料平臺 — 水位站監測（河川/地下水位，不限水庫），issue #135.
// Confirmed live (2026-09-08): no `api_key` param needed — plain GET returns
// JSON straight away, unlike MOENV's data.moenv.gov.tw sources elsewhere in
// this repo. Also confirmed live: the dataset itself is a "current status"
// snapshot (one row per station, no history), not a growing archive like the
// AQX_* sources — 373 rows total on a plain unpaginated fetch, so a single
// generously-limited request (no offset loop / MAX_PAGES cap) is safe here.
const WATER_LEVEL_DATASET_URL =
  "https://opendata.wra.gov.tw/api/v2/73c4c3de-4045-4765-abeb-89f9f9cd5ff0";
const FETCH_LIMIT = 5000;

export interface WaterLevelStationRecord {
  stationId: string;
  observatoryIdentifier: string | null;
  checkResult: string | null;
  checkDesc: string | null;
  volt: number | null;
  waterLevel: number | null;
  /** MySQL DATETIME string ("YYYY-MM-DD HH:MM:SS"), parsed from WRA's "datetime". */
  recordedAt: string;
}

const parseNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

// WRA ships "datetime" as ISO-ish "2026-09-08T23:50:00" (already Taipei local
// time, no timezone suffix — same convention this repo treats every other
// *_at column as). Normalize the "T" to a space for MySQL DATETIME.
const toMysqlDatetime = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim().replace("T", " ");
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.slice(0, 19) : null;
};

export async function fetchWaterLevelStations(): Promise<WaterLevelStationRecord[]> {
  const url = `${WATER_LEVEL_DATASET_URL}?sort=${encodeURIComponent("_importdate asc")}&format=JSON&limit=${FETCH_LIMIT}`;
  // Deliberately not the global fetch() — undici's WASM llhttp parser OOMs
  // on this host's low ulimit -v; see lib/server/net/httpClient.ts.
  const { status, text } = await httpGetText(url);
  if (status < 200 || status >= 300) {
    throw new Error(`WRA water level station request failed: HTTP ${status}`);
  }

  const data = JSON.parse(text);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : (data.records ?? []);

  return rows
    .map((rec): WaterLevelStationRecord | null => {
      const stationId = String(rec.stationid ?? "").trim();
      const recordedAt = toMysqlDatetime(rec.datetime);
      if (!stationId || !recordedAt) return null;

      return {
        stationId,
        observatoryIdentifier: rec.observatoryidentifier
          ? String(rec.observatoryidentifier).trim()
          : null,
        checkResult: rec.checkresult ? String(rec.checkresult).trim() : null,
        checkDesc: rec.checkdesc ? String(rec.checkdesc).trim() : null,
        volt: parseNum(rec.volt),
        waterLevel: parseNum(rec.waterlevel),
        recordedAt,
      };
    })
    .filter((r): r is WaterLevelStationRecord => r !== null);
}
