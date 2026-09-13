import { httpRequest } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { decodeCsvBuffer } from "./csvEncoding";
import type { RadiationStationRecord } from "./types";

// 台電開放資料 d525001 — 核電廠周邊輻射偵測站即時劑量率.
//
// IMPORTANT: issue #177's original text guessed this was 計畫性工作停電資料
// (scheduled outage data). That guess was WRONG — confirmed live via a GitHub
// Actions egress probe (databaseId 34370655418): the real columns are
// 站名,站號,劑量率(微西弗/小時),日期時間,經度,緯度 — per-station radiation
// dose-rate monitoring around Taipower's nuclear plants (核一/核二/核三),
// i.e. an environmental-safety dataset, not outage information. See
// docs/specs/taipower-energy-dashboard.md and the correction comment posted
// on issue #177.
const RADIATION_STATIONS_URL =
  "https://service.taipower.com.tw/data/opendata/apply/file/d525001/001.csv";

const parseNum = (v: string | undefined): number | null => {
  if (v === undefined) return null;
  const cleaned = v.trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** Source timestamp is "YYYYMMDDTHHMMSS" (e.g. "20260909T233025"), already Taipei local time. */
const toMysqlDatetime = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const clean = raw.trim().replace("T", "");
  if (clean.length < 14) return null;
  const y = clean.slice(0, 4);
  const m = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  const h = clean.slice(8, 10);
  const min = clean.slice(10, 12);
  const s = clean.slice(12, 14);
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
};

export async function fetchRadiationStations(): Promise<RadiationStationRecord[]> {
  const response = await httpRequest(RADIATION_STATIONS_URL, { timeoutMs: 20_000 });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Taipower d525001 request failed: HTTP ${response.status}`);
  }

  const text = decodeCsvBuffer(response.buffer);
  const rows = parseCsv(text);

  return rows
    .map((row): RadiationStationRecord | null => {
      const stationNo = (row["站號"] ?? "").trim();
      const stationName = (row["站名"] ?? "").trim();
      if (!stationNo || !stationName) return null;

      return {
        stationNo,
        stationName,
        doseRateUsvH: parseNum(row["劑量率(微西弗/小時)"]),
        recordedAt: toMysqlDatetime(row["日期時間"]),
        lat: parseNum(row["緯度"]),
        lng: parseNum(row["經度"]),
      };
    })
    .filter((r): r is RadiationStationRecord => r !== null);
}
