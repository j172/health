import { parseCsv } from "@/lib/server/facilities/csv";
import { assertHeaderColumns, parseCoordinates, textOrNull } from "@/lib/server/garbageRoutes/sources/shared";
import type { TruckPosition } from "@/lib/tools/garbageTrucks/live";
import type { LiveTruckAdapter } from "@/lib/server/garbageLive/types";
import { isInBounds, parseTaipeiLocalTime, type LatLngBounds } from "@/lib/server/garbageLive/adapters/shared";

// 新北市垃圾車即時位置 — data.gov.tw dataset 122972 (新北市政府資料開放平臺).
// One CSV row per vehicle currently reporting:
//   lineid,car,time,location,longitude,latitude,cityid,cityname
//   251010,KEV-0028,"2026/10/15 22:48:51",新北市淡水區中正路一段87巷8弄31-1號,121.41923,25.1812683333333,6501000,淡水區
// `time` is Taipei wall-clock time without a zone; `cityname` is the district.
// The file starts with a UTF-8 BOM. The catalog says it refreshes every 2 minutes
// and it only lists vehicles that are on the road: 11 rows at 22:27 on
// 2026-10-15, a single (already 78-minute-old) row at 00:07 the next morning.
//
// Host: data.ntpc.gov.tw answered 200 from both the production host and a GitHub
// runner in the 2026-10-15 egress probe (spec §3), so it is fetched directly at
// request time. Nothing from this feed is stored (decision #13).

const ENDPOINT = "https://data.ntpc.gov.tw/api/datasets/28ab4122-60e1-4065-98e5-abccb69aaca6/csv/file";

const REQUIRED_COLUMNS = ["lineid", "car", "time", "location", "longitude", "latitude"] as const;

/** Generous box around 新北市 (烏來 in the south, 石門 in the north, 貢寮 in the east): rejects 0,0 and other cities' trucks. */
const NEW_TAIPEI_BOUNDS: LatLngBounds = { minLat: 24.6, maxLat: 25.35, minLng: 121.25, maxLng: 122.05 };

/**
 * Parses the 122972 CSV text into one position per vehicle (the newest report
 * wins when a plate appears twice). Throws when the text is not this CSV — an
 * empty body, an HTML error page, a renamed header — so the county degrades
 * instead of claiming no truck is running. A header with no rows is a real
 * answer (no truck reporting) and returns [].
 */
export function adaptNtpc(rawText: string): TruckPosition[] {
  if (rawText.trim() === "") throw new Error("新北市垃圾車即時位置 (data.gov.tw 122972): empty response");
  assertHeaderColumns(rawText, REQUIRED_COLUMNS, "新北市垃圾車即時位置 (data.gov.tw 122972)");

  const latest = new Map<string, TruckPosition>();
  for (const row of parseCsv(rawText)) {
    const car = textOrNull(row["car"]);
    const lineId = textOrNull(row["lineid"]);
    if (!car || !lineId) continue;

    const recordedAt = parseTaipeiLocalTime(row["time"]);
    if (!recordedAt) continue;

    const coordinates = parseCoordinates(row["latitude"], row["longitude"]);
    if (!coordinates || !isInBounds(coordinates.lat, coordinates.lng, NEW_TAIPEI_BOUNDS)) continue;

    const previous = latest.get(car);
    if (previous && previous.recordedAt >= recordedAt) continue;
    latest.set(car, {
      lineId,
      car,
      lat: coordinates.lat,
      lng: coordinates.lng,
      location: textOrNull(row["location"]),
      district: textOrNull(row["cityname"]),
      recordedAt,
    });
  }
  return [...latest.values()];
}

export const ntpcLiveAdapter: LiveTruckAdapter = {
  city: "new_taipei",
  county: "新北市",
  sourceLabel: "新北市政府資料開放平臺「新北市垃圾車即時位置」",
  datasetUrl: "https://data.gov.tw/dataset/122972",
  endpoint: ENDPOINT,
  parse: adaptNtpc,
};
