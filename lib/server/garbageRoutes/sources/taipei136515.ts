import { httpGetText } from "@/lib/server/net/httpClient";
import { parseCsv } from "@/lib/server/facilities/csv";
import { normalizeClock } from "@/lib/tools/garbageTrucks/schedule";
import type { GarbageRouteStopRecord } from "@/lib/server/garbageRoutes/types";
import { assertHeaderColumns, parseCoordinates, textOrNull } from "@/lib/server/garbageRoutes/sources/shared";

// 臺北市垃圾車點位路線資訊 — data.gov.tw dataset 136515 (臺北市政府資料大平臺).
// One CSV row per scheduled stop, no weekday information:
//   行政區,里別,分隊,局編,車號,路線,車次,抵達時間,離開時間,地點,經度,緯度
// Measured 2026-10-15: 4,012 rows, 486 trips, UTF-8 with BOM, 558 KB.
//
// There is no key column, so a trip is identified as (局編, 路線, 車次) and a stop's
// rank is its position inside the trip ordered by arrival time. File order alone is
// not safe: the live file interleaves two routes' rows in one place (石牌-3 第3車's
// 22:07 stop sits after a 光明-4 row), which is why rows are grouped first and ranked
// second. 車號 (licence plate) is deliberately not stored.
//
// Times are compact HHMM and some trips run past midnight (2417 = 00:17 next day), so
// hours up to 29 are accepted — see normalizeClock.
//
// Host: data.taipei is already used by live sources (probe 2026-10-15: 200 from the
// production host for another data.taipei resource); this resource path itself has not
// been probed from the host — the first post-deploy sync is that probe.

const SOURCE_URL =
  "https://data.taipei/api/dataset/6bb3304b-4f46-4bb0-8cd1-60c66dcd1cae/resource/a6e90031-7ec4-4089-afb5-361a4efe7202/download";

export const TAIPEI_136515_SOURCE_KEY = "garbage_taipei_136515";

const REQUIRED_COLUMNS = ["行政區", "里別", "分隊", "局編", "路線", "車次", "抵達時間", "離開時間", "地點", "經度", "緯度"] as const;

interface PendingStop {
  record: Omit<GarbageRouteStopRecord, "stopRank">;
  fileIndex: number;
  arriveMinutes: number;
}

const clockToMinutes = (clock: string | null): number => {
  if (!clock) return Number.POSITIVE_INFINITY;
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Parses the 136515 CSV text into stop rows. Throws if the text is clearly not this CSV; skips unusable rows. */
export function parseTaipeiRoutes(csvText: string): GarbageRouteStopRecord[] {
  assertHeaderColumns(csvText, REQUIRED_COLUMNS, "臺北市垃圾車路線 (data.gov.tw 136515)");
  const rows = parseCsv(csvText);

  const trips = new Map<string, PendingStop[]>();
  rows.forEach((row, fileIndex) => {
    const lineName = textOrNull(row["路線"]);
    const stopName = textOrNull(row["地點"]);
    const district = textOrNull(row["行政區"]);
    if (!lineName || !stopName || !district) return;

    const coordinates = parseCoordinates(row["緯度"], row["經度"]);
    if (!coordinates) return;

    const tripLabel = textOrNull(row["車次"]);
    const lineId = [(row["局編"] ?? "").trim(), lineName, tripLabel ?? ""].join(":");
    const arriveTime = normalizeClock(row["抵達時間"]);

    const stop: PendingStop = {
      record: {
        city: "taipei",
        lineId,
        lineName,
        tripLabel,
        team: textOrNull(row["分隊"]),
        district,
        village: textOrNull(row["里別"]),
        stopName,
        lat: coordinates.lat,
        lng: coordinates.lng,
        arriveTime,
        departTime: normalizeClock(row["離開時間"]),
        garbageDays: null,
        recyclingDays: null,
        foodscrapsDays: null,
        memo: null,
      },
      fileIndex,
      arriveMinutes: clockToMinutes(arriveTime),
    };

    const trip = trips.get(lineId);
    if (trip) trip.push(stop);
    else trips.set(lineId, [stop]);
  });

  const records: GarbageRouteStopRecord[] = [];
  for (const stops of trips.values()) {
    stops.sort((a, b) => (a.arriveMinutes === b.arriveMinutes ? a.fileIndex - b.fileIndex : a.arriveMinutes - b.arriveMinutes));
    stops.forEach((stop, index) => {
      records.push({ ...stop.record, stopRank: index + 1 });
    });
  }
  return records;
}

export async function fetchTaipeiRoutes(): Promise<GarbageRouteStopRecord[]> {
  // Shared httpClient, never the global fetch() — undici's WASM parser OOMs on this host.
  const { status, text } = await httpGetText(SOURCE_URL, { timeoutMs: 60_000 });
  if (status < 200 || status >= 300) {
    throw new Error(`臺北市垃圾車路線 (136515) request failed: HTTP ${status}`);
  }
  return parseTaipeiRoutes(text);
}
