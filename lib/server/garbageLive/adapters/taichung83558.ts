import { parseCoordinates, textOrNull } from "@/lib/server/garbageRoutes/sources/shared";
import type { TruckFreshnessWindow, TruckPosition } from "@/lib/tools/garbageTrucks/live";
import type { LiveTruckAdapter } from "@/lib/server/garbageLive/types";
import { isInBounds, parseTaipeiLocalTime, type LatLngBounds } from "@/lib/server/garbageLive/adapters/shared";

// 臺中市垃圾清運及資源回收車動態資訊 — data.gov.tw dataset 83558 (臺中市政府資料開放平臺).
// A JSON array with one object per vehicle, every value a string:
//   {"lineid":"24908","car":"KED-1385","time":"20261016T001948","location":"龍井區清潔隊回收廠",
//    "X":"120.540645","Y":"24.192398","SpeedValue":"0","OverSpeed":"N"}
// X is the longitude, Y the latitude; `lineid` is the collection-point number;
// `time` is Taipei wall-clock time in the compact `YYYYMMDDTHHMMSS` form with no
// zone. There is no district column and no BOM. The catalog says it refreshes
// every 10 minutes.
//
// The feed lists every truck the city owns (663 rows on 2026-10-16), parked or
// not, each with its LAST known report: at 00:28 that morning 113 rows were under
// 10 minutes old and 22 were over six hours old, the oldest from 2025-09-29.
// This parser deliberately keeps all of them. Freshness is judged per request by
// getLiveTrucks against TAICHUNG_FRESHNESS below (reports older than 40 minutes
// are hidden and counted), so a year-old position can never be drawn on the map.
// Speed is not a filter either: a truck stands still at every collection point.
//
// Host: newdatacenter.taichung.gov.tw answered 200 from both the production host
// and a GitHub runner in the 2026-10-15 egress probe (spec §3, run
// 38764893673), so it is fetched directly at request time. The answer is ~100 KB.
// Nothing from this feed is stored (decision #13).

const ENDPOINT = "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c923ad20-2ec6-43b9-b3ab-54527e99f7bc";

const SOURCE_LABEL = "臺中市垃圾清運及資源回收車動態資訊 (data.gov.tw 83558)";

const REQUIRED_KEYS = ["lineid", "car", "time", "location", "X", "Y"] as const;

/**
 * Generous box around 臺中市 (和平區 梨山 in the east, 梧棲 in the west, and the
 * 南投縣信義鄉 stretch of 台21 where a 臺中 truck was seen reporting): rejects 0,0,
 * swapped values and other cities' trucks.
 */
const TAICHUNG_BOUNDS: LatLngBounds = { minLat: 23.6, maxLat: 24.5, minLng: 120.4, maxLng: 121.5 };

/**
 * 臺中's own freshness window. The dataset refreshes about every 10 minutes
 * (data.gov.tw metadata: updateFrequency 10 分), so a truck that is reporting
 * normally is routinely 10+ minutes old by the time we read it: at 00:28 on
 * 2026-10-16 only 113 of 663 rows were under 10 minutes old and 285 more were
 * 10-30 minutes old. The shared 10-minute window would flag about two thirds of
 * the drawn trucks 「資料較舊」 for no reason.
 *  - fresh up to 20 minutes = twice the update interval: one missed refresh
 *    still reads as current;
 *  - hidden after 40 minutes = four times the interval: three missed refreshes
 *    in a row mean the truck has stopped reporting. The cap is deliberate: the
 *    feed keeps rows for months (the oldest was from 2025-09-29), so the window
 *    must never grow open-ended.
 */
const TAICHUNG_FRESHNESS: TruckFreshnessWindow = { freshMaxAgeSeconds: 20 * 60, expiredAfterSeconds: 40 * 60 };

const COMPACT_TIME =/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

/**
 * Reads the feed's `20261016T001948` (Asia/Taipei wall-clock) as a UTC ISO
 * instant. The dash/slash forms the sibling feeds use are accepted too, so a
 * change of the publisher's format does not silently empty the map. Null for
 * anything that is not a real calendar date and clock time.
 */
export function parseTaichungTime(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const compact = COMPACT_TIME.exec(raw.trim());
  if (!compact) return parseTaipeiLocalTime(raw);
  const [, year, month, day, hour, minute, second] = compact;
  return parseTaipeiLocalTime(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

/** A cell as text: the feed publishes strings; a bare number is accepted too. */
const cell = (row: Row, key: string): string | undefined => {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
};

/**
 * Parses the 83558 JSON text into one position per vehicle (the newest report
 * wins when a plate appears twice). Throws when the text is not this feed — an
 * empty body, an HTML error page, a non-array answer, renamed columns, or a
 * time format nothing recognises — so the county degrades instead of claiming
 * no truck is running. An empty array is a real answer and returns [].
 */
export function adaptTaichung(rawText: string): TruckPosition[] {
  if (rawText.trim() === "") throw new Error(`${SOURCE_LABEL}: empty response`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${SOURCE_LABEL}: response is not JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${SOURCE_LABEL}: expected a JSON array of vehicles`);

  const rows = parsed.filter(isRow);
  if (parsed.length > 0 && !rows.some((row) => REQUIRED_KEYS.every((key) => key in row))) {
    throw new Error(`${SOURCE_LABEL}: unexpected shape, no row has the column(s) ${REQUIRED_KEYS.join(", ")}`);
  }

  const latest = new Map<string, TruckPosition>();
  let withPlate = 0;
  let withReadableTime = 0;
  for (const row of rows) {
    const car = textOrNull(cell(row, "car"));
    const lineId = textOrNull(cell(row, "lineid"));
    if (!car || !lineId) continue;
    withPlate += 1;

    const recordedAt = parseTaichungTime(cell(row, "time"));
    if (!recordedAt) continue;
    withReadableTime += 1;

    // X is the longitude and Y the latitude; parseCoordinates takes (lat, lng).
    const coordinates = parseCoordinates(cell(row, "Y"), cell(row, "X"));
    if (!coordinates || !isInBounds(coordinates.lat, coordinates.lng, TAICHUNG_BOUNDS)) continue;

    const previous = latest.get(car);
    if (previous && previous.recordedAt >= recordedAt) continue;
    latest.set(car, {
      lineId,
      car,
      lat: coordinates.lat,
      lng: coordinates.lng,
      location: textOrNull(cell(row, "location")),
      district: null,
      recordedAt,
    });
  }

  // Every row dropped for its time means the publisher changed the format, not that no truck runs.
  if (withPlate > 0 && withReadableTime === 0) {
    throw new Error(`${SOURCE_LABEL}: no row has a recognisable report time`);
  }
  return [...latest.values()];
}

export const taichungLiveAdapter: LiveTruckAdapter = {
  city: "taichung",
  county: "臺中市",
  sourceLabel: "臺中市政府資料開放平臺「臺中市垃圾清運及資源回收車動態資訊」",
  datasetUrl: "https://data.gov.tw/dataset/83558",
  endpoint: ENDPOINT,
  freshness: TAICHUNG_FRESHNESS,
  parse: adaptTaichung,
};
